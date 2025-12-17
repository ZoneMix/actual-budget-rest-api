/**
 * API Documentation authentication middleware.
 * Provides dual JWT and session-based authentication for Swagger UI access.
 */

import jwt from 'jsonwebtoken';
import { isTokenRevoked } from './jwt.js';

/**
 * Custom middleware for docs that accepts JWT or session auth.
 * Redirects to login if neither is present.
 */
export const authenticateForDocs = (req, res, next) => {
  // First try JWT authentication
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    // Use existing JWT middleware logic
    try {
      const decoded = jwt.decode(token);
      if (decoded && !isTokenRevoked(decoded.jti)) {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.user = payload;
        return next();
      }
    } catch (err) {
      // JWT invalid, continue to session check
    }
  }

  // Fallback to session authentication
  if (req.session && req.session.user) {
    req.user = { user_id: req.session.user.id, username: req.session.user.username, scope: 'api' };
    return next();
  }

  // Neither JWT nor session - redirect to consolidated login with return_to parameter
  res.redirect(`/login?return_to=${encodeURIComponent(req.originalUrl)}`);
};