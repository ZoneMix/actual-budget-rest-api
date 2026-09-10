/**
 * API Documentation authentication middleware.
 * Provides dual JWT and session-based authentication for Swagger UI access.
 */

import jwt from 'jsonwebtoken';
import { isTokenRevoked, JWT_VERIFY_OPTIONS } from './jwt.js';
import { JWT_SECRET } from '../config/index.js';
import { throwUnauthorized } from '../middleware/responseHelpers.js';

/**
 * Verifies a Bearer token and returns its payload, or null when the token is
 * missing, unverifiable or revoked.
 *
 * `await` on isTokenRevoked is load-bearing: it is async, so an un-awaited call
 * returns an always-truthy Promise, `!promise` is always false, and this branch
 * never assigned a user — no Bearer token could open /docs at all.
 */
const verifyBearer = async (token) => {
  if (!token) return null;

  try {
    const payload = jwt.verify(token, JWT_SECRET, JWT_VERIFY_OPTIONS);
    if (payload && !(await isTokenRevoked(payload.jti))) {
      return payload;
    }
  } catch {
    // JWT invalid or expired, fall through to the session check
  }

  return null;
};

/**
 * Custom middleware for docs that accepts JWT or session auth.
 *
 * A caller that presented a Bearer token gets a 401 when it does not check
 * out; only a caller with no credentials at all is redirected to the login
 * page. Bouncing a programmatic client to an HTML form tells it nothing.
 */
export const authenticateForDocs = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  const payload = await verifyBearer(token);
  if (payload) {
    req.user = payload;
    return next();
  }

  // Fallback to session authentication
  if (req.session && req.session.user) {
    req.user = { user_id: req.session.user.id, username: req.session.user.username, scope: 'api' };
    return next();
  }

  if (token) {
    throwUnauthorized('Invalid or revoked token');
  }

  // No credentials at all - redirect to consolidated login with return_to
  res.redirect(`/login?return_to=${encodeURIComponent(req.originalUrl)}`);
};
