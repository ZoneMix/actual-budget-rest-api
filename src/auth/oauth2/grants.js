/**
 * OAuth2 token grants: authorization_code and refresh_token.
 *
 * Extracted from src/routes/oauth2.js so the route file stays route wiring and
 * the grant logic — where the scope and role decisions live — is testable and
 * readable on its own.
 *
 * Both grants re-derive the granted scope from the client's *current*
 * `allowed_scopes` rather than trusting what was stored at authorize time: a
 * client whose scopes were narrowed since must not keep minting the old ones.
 */

import jwt from 'jsonwebtoken';
import { issueTokens, isTokenRevoked, revokeToken, JWT_VERIFY_OPTIONS } from '../jwt.js';
import { validateAuthCode } from './code.js';
import { clientAllowedScopes, formatScopes, intersectScopes, parseRequestedScopes } from './scopes.js';
import { getRow } from '../../db/authDb.js';
import { JWT_REFRESH_SECRET } from '../../config/index.js';
import { throwBadRequest, throwInternalError, throwUnauthorized } from '../../middleware/responseHelpers.js';
import logger, { logAuthEvent } from '../../logging/logger.js';

const DEFAULT_ROLE = 'user';

/**
 * Intersect a scope request with what the client may grant.
 * An empty intersection is refused rather than issued: a token with no scope
 * expands to the legacy `api` grant, which would *widen* it.
 */
const grantScopes = (client, requestedRaw) => {
  const allowed = clientAllowedScopes(client);
  const granted = intersectScopes(parseRequestedScopes(requestedRaw), allowed);
  if (granted.length === 0) {
    throwBadRequest('invalid_scope: the client is not allowed any of the requested scopes');
  }
  return formatScopes(granted);
};

/**
 * Exchange an authorization code for tokens.
 *
 * @param {object} params
 * @param {object} params.client - Validated client row
 * @param {string} params.clientId - Client identifier
 * @param {string} params.code - Authorization code
 * @param {string} params.redirectUri - Redirect URI the code was issued for
 * @returns {Promise<object>} Token response
 */
export const exchangeAuthorizationCode = async ({ client, clientId, code, redirectUri }) => {
  const { userId, scope } = await validateAuthCode(code, clientId, redirectUri);

  logger.debug('[OAuth2] Authorization code validated', { clientId, userId, scope });

  const user = await getRow('SELECT username, role FROM users WHERE id = ?', [userId]);
  if (!user) {
    logger.error('[OAuth2] User not found after code validation', { userId, clientId });
    throwInternalError('User not found');
  }

  const grantedScopes = grantScopes(client, scope);
  const role = user.role || DEFAULT_ROLE;
  const tokens = await issueTokens(userId, user.username, grantedScopes, role);

  logger.info('[OAuth2] Tokens issued via authorization code', {
    clientId,
    userId,
    username: user.username,
    scope: grantedScopes,
    role,
  });

  return tokens;
};

/** Verify a refresh token and load the user behind it. */
const resolveRefreshSubject = async (refreshToken, clientId) => {
  const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET, JWT_VERIFY_OPTIONS);

  if (await isTokenRevoked(decoded.jti)) {
    logAuthEvent('REFRESH_FAILED', decoded.user_id, { reason: 'token_revoked', clientId }, false);
    throwUnauthorized('Refresh token revoked');
  }

  const user = await getRow('SELECT username, role, scopes FROM users WHERE id = ?', [decoded.user_id]);
  if (!user) {
    logger.error('[OAuth2] User not found for refresh token', { userId: decoded.user_id, clientId });
    throwInternalError('User not found');
  }

  return { decoded, user };
};

/**
 * Exchange a refresh token for a new token pair (rotation).
 *
 * @param {object} params
 * @param {object} params.client - Validated client row
 * @param {string} params.clientId - Client identifier
 * @param {string} params.refreshToken - Refresh token to rotate
 * @returns {Promise<object>} Token response
 */
export const exchangeRefreshToken = async ({ client, clientId, refreshToken }) => {
  try {
    const { decoded, user } = await resolveRefreshSubject(refreshToken, clientId);

    const role = user.role || decoded.role || DEFAULT_ROLE;
    const grantedScopes = grantScopes(client, user.scopes || decoded.scope);
    const tokens = await issueTokens(decoded.user_id, user.username, grantedScopes, role);

    // Rotation: the presented refresh token dies with the new pair's issue.
    await revokeToken(decoded.jti);

    logAuthEvent('TOKEN_REFRESHED', decoded.user_id, { username: user.username, role, clientId }, true);
    logger.info('[OAuth2] Tokens issued via refresh_token', {
      clientId,
      userId: decoded.user_id,
      username: user.username,
      scope: grantedScopes,
    });

    return tokens;
  } catch (err) {
    // HTTP errors raised above (revoked, invalid_scope, missing user) stand as-is.
    if (err.status) throw err;

    logAuthEvent('REFRESH_FAILED', null, { reason: 'invalid_token', error: err.message, clientId }, false);
    return throwUnauthorized('Invalid or expired refresh token');
  }
};
