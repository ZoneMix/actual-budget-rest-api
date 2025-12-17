/**
 * JWT issuance, auth, revocation, and validation helpers.
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getDb, insertToken, pruneExpiredTokens } from '../db/authDb.js';
import { ACCESS_TTL_SECONDS, REFRESH_TTL_SECONDS } from '../config/index.js';

/**
 * Issue access and refresh tokens for a user.
 */
export const issueTokens = (userId, username, scope = 'api') => {
  pruneExpiredTokens();

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

  insertToken(jti, 'access', accessExpiresAt);
  insertToken(`${jti}-refresh`, 'refresh', refreshExpiresAt);

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
  console.log(`Token ${jti} revoked.`);
};

/**
 * Check if a token is revoked.
 */
export const isTokenRevoked = (jti) => {
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
    return res.status(401).json({ error: 'Authorization header with Bearer token required' });
  }

  try {
    const decoded = jwt.decode(token);
    if (!decoded || isTokenRevoked(decoded.jti)) {
      return res.status(401).json({ error: 'Token revoked or malformed' });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;

    // Basic scope enforcement (extend as needed)
    const requiredScope = req.path.startsWith('/accounts') ? 'api' : null;
    const tokenScopes = payload.scope || 'api';
    if (requiredScope && !tokenScopes.includes(requiredScope)) {
      return res.status(403).json({ error: 'Insufficient scopes' });
    }

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Access token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};