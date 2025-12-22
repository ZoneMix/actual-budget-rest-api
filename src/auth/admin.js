/**
 * Admin authentication middleware.
 * Verifies that the authenticated user has admin role or admin scope.
 */

import { authenticateJWT } from './jwt.js';
import { throwUnauthorized, throwForbidden } from '../middleware/responseHelpers.js';
import { isAdmin } from './permissions.js';
import logger from '../logging/logger.js';

/**
 * Middleware to require admin authentication.
 * Must be used after authenticateJWT middleware.
 * 
 * Checks if the authenticated user has role='admin' or scope='admin'.
 */
export const requireAdmin = (req, res, next) => {
  // authenticateJWT should have already set req.user
  if (!req.user) {
    logger.warn('Admin access attempted without authentication', { ip: req.ip });
    throwUnauthorized('Authentication required');
  }

  if (!isAdmin(req.user)) {
    logger.warn('Non-admin user attempted admin access', {
      username: req.user.username,
      role: req.user.role,
      scopes: req.user.scopes || req.user.scope,
      ip: req.ip,
      path: req.path,
    });
    throwForbidden('Admin access required');
  }

  next();
};

/**
 * Combined middleware: authenticate JWT and require admin.
 * Use this for admin-only endpoints.
 */
export const authenticateAdmin = [authenticateJWT, requireAdmin];

