/**
 * Authentication routes for JWT-based API access.
 *
 * Endpoints:
 * - POST /auth/login  - Authenticate with username/password or refresh token
 * - POST /auth/logout - Revoke access and optionally refresh tokens
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { authenticateUser } from '../auth/user.js';
import { issueTokens, revokeToken, isTokenRevoked, authenticateJWT, JWT_VERIFY_OPTIONS } from '../auth/jwt.js';
import { expandScopes, formatScopes, intersectScopes, parseScopeList, SCOPES } from '../auth/scopes.js';
import { insertToken, getRow } from '../db/authDb.js';
import {
  ACCESS_TTL_SECONDS,
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  JWT_ISSUER,
  JWT_AUDIENCE,
} from '../config/index.js';
import { validateBody } from '../middleware/validation-schemas.js';
import { LoginSchema, LogoutSchema } from '../middleware/validation-schemas.js';
import logger, { logAuthEvent } from '../logging/logger.js';
import { loginLimiterWithLogging } from '../middleware/rateLimiters.js';
import { throwUnauthorized, throwBadRequest } from '../middleware/responseHelpers.js';
import { standardBodyParser } from '../middleware/bodyParser.js';

const router = express.Router();
router.use(standardBodyParser);

/**
 * POST /auth/login
 *
 * Supports two authentication flows:
 * 1. Refresh token: Exchange refresh token for new access token
 * 2. Password: Authenticate with username/password to get access + refresh tokens
 */
router.post('/login', loginLimiterWithLogging, validateBody(LoginSchema), async (req, res) => {
  const { username, password, refresh_token } = req.validatedBody;

  // Flow 1: Refresh token exchange
  if (refresh_token && !username && !password) {
    try {
      const decoded = jwt.verify(refresh_token, JWT_REFRESH_SECRET, JWT_VERIFY_OPTIONS);

      // Check if token was revoked
      if (await isTokenRevoked(decoded.jti)) {
        logAuthEvent('REFRESH_FAILED', decoded.user_id, { reason: 'token_revoked' }, false);
        throwUnauthorized('Refresh token revoked');
      }

      // A refresh token outlives the account: it stays valid for
      // JWT_REFRESH_TTL and nothing revokes it when the user is deactivated or
      // deleted. Without the is_active filter and this guard, a disabled
      // account kept minting access tokens — and expandScopes(undefined) would
      // hand the missing row the legacy `api` grant on the way out. Mirrors
      // resolveRefreshSubject() in src/auth/oauth2/grants.js.
      const user = await getRow('SELECT role, scopes FROM users WHERE id = ? AND is_active = TRUE', [decoded.user_id]);
      if (!user) {
        logAuthEvent('REFRESH_FAILED', decoded.user_id, { reason: 'user_inactive_or_missing' }, false);
        throwUnauthorized('User is no longer active');
      }
      const role = user.role || decoded.role || 'user';

      // The refresh token's scope claim is what was granted; the user's row is
      // what they still hold. Narrow to both. Reading the user's row first (as
      // this did) hands a token granted `read` everything the user could have
      // asked for — the same widening /oauth/token was fixed for. The fallback
      // is only for refresh tokens minted before the claim existed.
      const scopeArray = intersectScopes(
        parseScopeList(decoded.scope || user.scopes || SCOPES.LEGACY_API),
        expandScopes(user.scopes)
      );
      if (scopeArray.length === 0) {
        logAuthEvent('REFRESH_FAILED', decoded.user_id, { reason: 'scopes_no_longer_held' }, false);
        throwUnauthorized('Refresh token grants no scope the user still holds');
      }
      const scopeString = formatScopes(scopeArray);

      // Generate new access token with new JTI
      const newJti = crypto.randomUUID();
      const accessExpiresAt = new Date(Date.now() + ACCESS_TTL_SECONDS * 1000).toISOString();
      const accessToken = jwt.sign(
        { user_id: decoded.user_id, username: decoded.username, role, scope: scopeString, scopes: scopeArray, iss: JWT_ISSUER, aud: JWT_AUDIENCE },
        JWT_SECRET,
        { expiresIn: `${ACCESS_TTL_SECONDS}s`, jwtid: newJti }
      );

      await insertToken(newJti, 'access', accessExpiresAt);
      logAuthEvent('TOKEN_REFRESHED', decoded.user_id, { username: decoded.username, role }, true);

      return res.json({
        access_token: accessToken,
        expires_in: ACCESS_TTL_SECONDS,
        token_type: 'Bearer',
        scope: scopeString,
      });
    } catch (err) {
      // Re-throw HTTP errors (like throwUnauthorized above)
      if (err.status) throw err;
      
      // Handle JWT verification errors
      logAuthEvent('REFRESH_FAILED', null, { reason: 'invalid_token', error: err.message }, false);
      throwUnauthorized('Invalid or expired refresh token');
    }
  }

  // Flow 2: Username/password authentication
  if (!username || !password) {
    throwBadRequest('Username and password required');
  }

  const { userId, username: uname, role, scopes } = await authenticateUser(username, password);
  const tokens = await issueTokens(userId, uname, scopes, role);
  res.json(tokens);
});

/**
 * POST /auth/logout
 *
 * Revokes the current access token (from JWT middleware) and optionally
 * revokes a refresh token if provided in the request body.
 */
router.post('/logout', authenticateJWT, validateBody(LogoutSchema), async (req, res) => {
  const user = req.user; // Set by authenticateJWT middleware

  // Always revoke the current access token
  if (user?.jti) {
    await revokeToken(user.jti);
    logAuthEvent('LOGOUT', user.user_id, { username: user.username, jti: user.jti }, true);
  }

  // Optionally revoke refresh token if provided
  const { refresh_token } = req.validatedBody;
  if (refresh_token) {
    try {
      const decodedRefresh = jwt.verify(refresh_token, JWT_REFRESH_SECRET, JWT_VERIFY_OPTIONS);
      if (decodedRefresh?.jti) {
        await revokeToken(decodedRefresh.jti);
        logAuthEvent('REFRESH_REVOKED', user.user_id, { jti: decodedRefresh.jti }, true);
      }
      res.json({ success: true, message: 'Logged out successfully – access and refresh tokens revoked' });
    } catch (err) {
      // Refresh token invalid/expired, but access token already revoked
      logger.warn('Invalid refresh_token provided on logout', { error: err.message, userId: user.user_id });
      res.json({
        success: true,
        message: 'Access token revoked; refresh_token was invalid or already expired'
      });
    }
  } else {
    res.json({ success: true, message: 'Access token revoked (no refresh_token provided)' });
  }
});

export default router;