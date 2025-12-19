/**
 * Permission and scope checking utilities.
 * 
 * Provides helpers for checking user permissions and scopes.
 * Used for fine-grained access control on endpoints.
 */

/**
 * Check if user has a specific scope.
 * 
 * @param {object} user - User object from JWT (req.user)
 * @param {string|string[]} requiredScopes - Required scope(s) to check
 * @returns {boolean} True if user has all required scopes
 */
export const hasScope = (user, requiredScopes) => {
  if (!user) return false;
  
  // Normalize to array
  const required = Array.isArray(requiredScopes) ? requiredScopes : [requiredScopes];
  if (required.length === 0) return true;
  
  // Get user's scopes
  let userScopes = [];
  if (Array.isArray(user.scopes)) {
    userScopes = user.scopes;
  } else if (user.scope) {
    userScopes = user.scope.split(',').map(s => s.trim()).filter(Boolean);
  } else {
    // Default to 'api' scope if none specified
    userScopes = ['api'];
  }
  
  // Check if user has all required scopes
  return required.every(scope => userScopes.includes(scope));
};

/**
 * Check if user has admin role or admin scope.
 * 
 * @param {object} user - User object from JWT (req.user)
 * @returns {boolean} True if user is admin
 */
export const isAdmin = (user) => {
  if (!user) return false;
  
  // Check role first
  if (user.role === 'admin') {
    return true;
  }
  
  // Fallback to scope check
  return hasScope(user, 'admin');
};

/**
 * Middleware factory to require specific scope(s).
 * 
 * @param {string|string[]} requiredScopes - Required scope(s)
 * @returns {Function} Express middleware
 * 
 * @example
 * router.get('/sensitive', requireScope('admin'), handler);
 * router.get('/data', requireScope(['read', 'data']), handler);
 */
export const requireScope = (requiredScopes) => {
  return (req, res, next) => {
    if (!req.user) {
      const { throwUnauthorized } = require('../middleware/responseHelpers.js');
      throwUnauthorized('Authentication required');
    }
    
    if (!hasScope(req.user, requiredScopes)) {
      const { throwForbidden } = require('../middleware/responseHelpers.js');
      throwForbidden(`Required scope(s): ${Array.isArray(requiredScopes) ? requiredScopes.join(', ') : requiredScopes}`);
    }
    
    next();
  };
};

/**
 * Middleware factory to require admin role or scope.
 * 
 * @returns {Function} Express middleware
 * 
 * @example
 * router.get('/admin-only', requireAdminRole(), handler);
 */
export const requireAdminRole = () => {
  return (req, res, next) => {
    if (!req.user) {
      const { throwUnauthorized } = require('../middleware/responseHelpers.js');
      throwUnauthorized('Authentication required');
    }
    
    if (!isAdmin(req.user)) {
      const { throwForbidden } = require('../middleware/responseHelpers.js');
      throwForbidden('Admin access required');
    }
    
    next();
  };
};

