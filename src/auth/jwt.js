/**
 * JWT issuance, auth, revocation, and validation helpers.
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { insertToken, pruneExpiredTokens, executeQuery, getRow } from '../db/authDb.js';
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
 * Validate JTI format (UUID v4 or UUID v4 with '-refresh' suffix for refresh tokens).
 * Returns true if jti is a valid UUID v4 format or refresh token format, false otherwise.
 */
const validateJTI = (jti) => {
  if (!jti || typeof jti !== 'string') return false;
  // UUID v4 pattern
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  // Refresh token pattern (UUID v4 + '-refresh')
  const REFRESH_JTI_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-refresh$/i;
  return UUID_PATTERN.test(jti) || REFRESH_JTI_PATTERN.test(jti);
};

/**
 * Issue access and refresh tokens for a user.
 */
export const issueTokens = async (userId, username, scope = 'api') => {
  await pruneExpiredTokens();

  const jti = crypto.randomUUID();
  const now = Date.now();
  const accessExpiresAt = new Date(now + ACCESS_TTL_SECONDS * 1000).toISOString();
  const refreshExpiresAt = new Date(now + REFRESH_TTL_SECONDS * 1000).toISOString();

  const accessToken = jwt.sign(
    { user_id: userId, username, iss: 'actual-wrapper', aud: 'n8n', scope },
    process.env.JWT_SECRET,
    { expiresIn: `${ACCESS_TTL_SECONDS}s`, jwtid: jti }
  );

  const refreshToken = jwt.sign(
    { user_id: userId, username, iss: 'actual-wrapper', aud: 'n8n' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: `${REFRESH_TTL_SECONDS}s`, jwtid: `${jti}-refresh` }
  );

  // Validate JTI format before inserting (should always be valid since we generate it)
  if (!validateJTI(jti)) {
    logger.error(`Invalid JTI format generated: ${jti}`);
    throw new Error('Failed to generate valid JTI');
  }
  
  await insertToken(jti, 'access', accessExpiresAt);
  await insertToken(`${jti}-refresh`, 'refresh', refreshExpiresAt);

  logAuthEvent('TOKEN_ISSUED', userId, { scope }, true);

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: ACCESS_TTL_SECONDS,
    token_type: 'Bearer',
    scope,
  };
};

/**
 * Revoke a token by JTI (used on logout).
 */
export const revokeToken = async (jti) => {
  if (!validateJTI(jti)) {
    logger.warn(`Invalid JTI format: ${jti}`);
    throw new Error('Invalid JTI format');
  }
  await pruneExpiredTokens();
  const result = await executeQuery('UPDATE tokens SET revoked = TRUE WHERE jti = ?', [jti]);
  if (result.changes === 0) {
    const placeholderExpiry = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000).toISOString();
    await executeQuery(
      "INSERT INTO tokens (jti, token_type, expires_at, revoked) VALUES (?, 'unknown', ?, TRUE)",
      [jti, placeholderExpiry]
    );
  }
};

/**
 * Check if a token is revoked.
 */
export const isTokenRevoked = async (jti) => {
  if (!jti) return true;
  if (!validateJTI(jti)) {
    logger.warn(`Invalid JTI format in isTokenRevoked: ${jti}`);
    return true; // Invalid format treated as revoked
  }
  await pruneExpiredTokens();
  const row = await getRow('SELECT revoked FROM tokens WHERE jti = ?', [jti]);
  if (!row) return false;
  // SQLite returns 1/0 for booleans, PostgreSQL returns true/false
  return row.revoked === true || row.revoked === 1;
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
    if (await isTokenRevoked(payload.jti)) {
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