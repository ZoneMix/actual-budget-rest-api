/**
 * Admin API authentication middleware.
 * Provides dual JWT and session-based authentication for admin API endpoints.
 * Verifies that the authenticated user has admin role or admin scope.
 */

import jwt from 'jsonwebtoken';
import { isTokenRevoked } from './jwt.js';
import { getDb } from '../db/authDb.js';
import { isAdmin } from './permissions.js';
import { throwUnauthorized, throwForbidden } from '../middleware/responseHelpers.js';
import logger from '../logging/logger.js';

/**
 * Middleware for admin API endpoints that accepts JWT or session auth.
 * Verifies the user has admin role or admin scope.
 * Returns 401/403 for API calls, redirects for browser requests.
 */
export const authenticateAdminAPI = (req, res, next) => {
  let user = null;

  // First try JWT authentication
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (payload && !isTokenRevoked(payload.jti)) {
        user = payload;
      }
    } catch {
      // JWT invalid or expired, continue to session check
    }
  }

  // Fallback to session authentication
  if (!user && req.session && req.session.user) {
    const db = getDb();
    const dbUser = db.prepare('SELECT id, username, role, scopes FROM users WHERE id = ? AND is_active = TRUE').get(req.session.user.id);
    
    if (dbUser) {
      // Parse scopes
      const scopes = dbUser.scopes ? dbUser.scopes.split(',').map(s => s.trim()).filter(Boolean) : ['api'];
      
      user = {
        user_id: dbUser.id,
        username: dbUser.username,
        role: dbUser.role || 'user',
        scopes: scopes,
        scope: dbUser.scopes || 'api',
      };
    }
  }

  // No authentication found
  if (!user) {
    // For API requests (JSON), return 401
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      throwUnauthorized('Authentication required');
    }
    // For browser requests, redirect to login
    return res.redirect(`/login?return_to=${encodeURIComponent(req.originalUrl)}`);
  }

  // Verify admin access
  if (!isAdmin(user)) {
    logger.warn('Non-admin user attempted admin API access', {
      username: user.username,
      role: user.role,
      scopes: user.scopes || user.scope,
      ip: req.ip,
      path: req.path,
    });
    throwForbidden('Admin access required');
  }

  // Attach user to request
  req.user = user;
  next();
};

