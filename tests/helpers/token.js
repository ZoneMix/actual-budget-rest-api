/**
 * Test helper: sign a JWT access token shaped exactly like `issueTokens()`
 * in src/auth/jwt.js, without touching the auth DB.
 *
 * No token-table row is needed: `isTokenRevoked()` returns false for a jti
 * that has no row, so any fresh UUID v4 jti is accepted as non-revoked.
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export const signTestToken = ({
  userId = 1,
  username = 'tester',
  scopes = 'api',
  role = 'user',
} = {}) => {
  const scopeString = Array.isArray(scopes) ? scopes.join(',') : scopes;
  const scopeArray = Array.isArray(scopes) ? scopes : scopes.split(',').map((s) => s.trim()).filter(Boolean);

  return jwt.sign(
    {
      user_id: userId,
      username,
      role,
      scope: scopeString,
      scopes: scopeArray,
      iss: 'actual-wrapper',
      aud: 'n8n',
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h', jwtid: crypto.randomUUID() }
  );
};
