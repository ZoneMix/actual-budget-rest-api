/**
 * OAuth2 token grants: authorization_code and refresh_token.
 *
 * Extracted from src/routes/oauth2.js so the route file stays route wiring and
 * the grant logic — where the scope and role decisions live — is testable and
 * readable on its own.
 *
 * Both grants re-derive the granted scope from the client's *current*
 * `allowed_scopes` AND the user's *current* `users.scopes` rather than trusting
 * what was stored at authorize time: neither a client nor a user whose scopes
 * were narrowed since may keep minting the old ones.
 */

import jwt from 'jsonwebtoken';
import { issueTokens, isTokenRevoked, revokeToken, JWT_VERIFY_OPTIONS } from '../jwt.js';
import { validateAuthCode } from './code.js';
import {
  clientAllowedScopes,
  clientDefaultScopes,
  formatScopes,
  intersectScopes,
  parseRequestedScopes,
  userHeldScopes,
} from './scopes.js';
import { getRow } from '../../db/authDb.js';
import { JWT_REFRESH_SECRET } from '../../config/index.js';
import { throwBadRequest, throwUnauthorized } from '../../middleware/responseHelpers.js';
import logger, { logAuthEvent } from '../../logging/logger.js';

const DEFAULT_ROLE = 'user';

/**
 * Intersect a scope request with what the client may grant AND what the user
 * holds. An empty intersection is refused rather than issued: a token with no
 * scope expands to the legacy `api` grant, which would *widen* it.
 */
const grantScopes = (client, user, requestedRaw) => {
  const granted = intersectScopes(
    // No `scope` in the request means the client's own registration, not a
    // global default it may not even be allowed (RFC 6749 §3.3).
    parseRequestedScopes(requestedRaw, clientDefaultScopes(client)),
    clientAllowedScopes(client),
    userHeldScopes(user)
  );
  if (granted.length === 0) {
    throwBadRequest('invalid_scope: the client and user do not share any of the requested scopes');
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

  const user = await getRow(
    'SELECT username, role, scopes FROM users WHERE id = ? AND is_active = TRUE',
    [userId]
  );
  if (!user) {
    // The code may have been minted moments before the account was deactivated.
    logAuthEvent('OAUTH_CODE_EXCHANGE_FAILED', userId, { reason: 'user_inactive', clientId }, false);
    throwUnauthorized('User is not active');
  }

  // Re-checked here, not only at authorize time: the user's scopes may have
  // been narrowed in the ten minutes the code is valid for.
  const grantedScopes = grantScopes(client, user, scope);
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

  const user = await getRow(
    'SELECT username, role, scopes FROM users WHERE id = ? AND is_active = TRUE',
    [decoded.user_id]
  );
  if (!user) {
    // A refresh token can outlive the account by up to JWT_REFRESH_TTL; a
    // deleted or deactivated user must not be able to mint new access tokens.
    logAuthEvent('REFRESH_FAILED', decoded.user_id, { reason: 'user_inactive', clientId }, false);
    throwUnauthorized('User is not active');
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
    // The refresh token's own scope claim is what was granted. Falling back to
    // the user's DB scopes is only for refresh tokens minted before that claim
    // existed; using it as the primary source would widen every narrow grant
    // to everything the user could have asked for.
    const grantedScopes = grantScopes(client, user, decoded.scope || user.scopes);
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
