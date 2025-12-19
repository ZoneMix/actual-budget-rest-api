/**
 * JWT issuance, auth, revocation, and validation helpers.
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getDb, insertToken, pruneExpiredTokens } from '../db/authDb.js';
import { ACCESS_TTL_SECONDS, REFRESH_TTL_SECONDS } from '../config/index.js';
import logger, { logAuthEvent, logSuspiciousActivity } from '../logging/logger.js';

// Verify JWT secrets are configured
if (!process.env.JWT_SECRET) {
  logger.error('FATAL: JWT_SECRET is required but not set');
  process.exit(1);
}

if (!process.env.JWT_REFRESH_SECRET) {
  logger.error('FATAL: JWT_REFRESH_SECRET is required but not set');
  process.exit(1);
}

/**
 * Issue access and refresh tokens for a user.
 * 
 * @param {number} userId - User ID
 * @param {string} username - Username
 * @param {string|string[]} scopes - User scopes (comma-separated string or array)
 * @param {string} role - User role (optional, defaults to 'user')
 */
export const issueTokens = (userId, username, scopes = 'api', role = 'user') => {
  pruneExpiredTokens();

  // Normalize scopes to comma-separated string
  const scopeString = Array.isArray(scopes) ? scopes.join(',') : scopes;
  const scopeArray = Array.isArray(scopes) ? scopes : scopes.split(',').map(s => s.trim()).filter(Boolean);

  const jti = crypto.randomUUID();
  const now = Date.now();
  const accessExpiresAt = new Date(now + ACCESS_TTL_SECONDS * 1000).toISOString();
  const refreshExpiresAt = new Date(now + REFRESH_TTL_SECONDS * 1000).toISOString();

  const accessToken = jwt.sign(
    { user_id: userId, username, role, scope: scopeString, scopes: scopeArray, iss: 'actual-wrapper', aud: 'n8n' },
    process.env.JWT_SECRET,
    { expiresIn: `${ACCESS_TTL_SECONDS}s`, jwtid: jti }
  );

  const refreshToken = jwt.sign(
    { user_id: userId, username, role, iss: 'actual-wrapper', aud: 'n8n' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: `${REFRESH_TTL_SECONDS}s`, jwtid: `${jti}-refresh` }
  );

  insertToken(jti, 'access', accessExpiresAt);
  insertToken(`${jti}-refresh`, 'refresh', refreshExpiresAt);

  logAuthEvent('TOKEN_ISSUED', userId, { scope: scopeString, role }, true);

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: ACCESS_TTL_SECONDS,
    token_type: 'Bearer',
    scope: scopeString,
  };
};

/**
 * Revoke a token by JTI (used on logout).
 */
export const revokeToken = (jti) => {
  pruneExpiredTokens();
  const db = getDb();
  const { changes } = db.prepare('UPDATE tokens SET revoked = TRUE WHERE jti = ?').run(jti);
  if (changes === 0) {
    const placeholderExpiry = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000).toISOString();
    db.prepare(
      "INSERT INTO tokens (jti, token_type, expires_at, revoked) VALUES (?, 'unknown', ?, TRUE)"
    ).run(jti, placeholderExpiry);
  }
};

/**
 * Check if a token is revoked.
 */
export const isTokenRevoked = (jti) => {
  if (!jti) return true;
  pruneExpiredTokens();
  const db = getDb();
  const row = db.prepare('SELECT revoked FROM tokens WHERE jti = ?').get(jti);
  if (!row) return false;
  return row.revoked === 1;
};

export const authenticateJWT = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    logAuthEvent('AUTH_FAILED', null, { reason: 'missing_token', ip: req.ip }, false);
    return res.status(401).json({ error: 'Authorization header with Bearer token required' });
  }

  try {
    // Verify signature FIRST - this prevents tampered tokens
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Then check if token is revoked
    if (isTokenRevoked(payload.jti)) {
      logSuspiciousActivity('REVOKED_TOKEN_USE', payload.user_id, { jti: payload.jti, ip: req.ip });
      return res.status(401).json({ error: 'Token has been revoked' });
    }

    req.user = payload;

    // Basic scope enforcement (extend as needed)
    const requiredScope = req.path.startsWith('/accounts') ? 'api' : null;
    const tokenScopes = payload.scope || 'api';
    if (requiredScope && !tokenScopes.includes(requiredScope)) {
      logAuthEvent('AUTH_FAILED', payload.user_id, { reason: 'insufficient_scope', required: requiredScope }, false);
      return res.status(403).json({ error: 'Insufficient scopes' });
    }

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      logAuthEvent('AUTH_FAILED', null, { reason: 'token_expired', ip: req.ip }, false);
      return res.status(401).json({ error: 'Access token expired' });
    }
    if (err.name === 'JsonWebTokenError') {
      logSuspiciousActivity('INVALID_TOKEN', null, { error: err.message, ip: req.ip });
      return res.status(401).json({ error: 'Invalid token' });
    }
    logAuthEvent('AUTH_FAILED', null, { reason: 'auth_error', error: err.message }, false);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};