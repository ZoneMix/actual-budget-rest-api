/**
 * Scope enforcement middleware.
 *
 * The scope model itself lives in ./scopes.js; this module is only the Express
 * layer over it. `hasScope`/`isAdmin` are re-exported so existing importers
 * (src/auth/adminApi.js) keep working unchanged.
 *
 * Rollout is staged through AUTH_SCOPE_ENFORCEMENT, read at request time via
 * config's getScopeEnforcementMode():
 *
 *   off     — no scope decision at all, next() immediately
 *   warn    — log SCOPE_WOULD_DENY on a would-be denial, then next() (default)
 *   enforce — 403 on a denial
 *
 * `requireAdminRole()` is the exception: a role gate is not part of that
 * rollout, so it always enforces.
 */

import { SCOPES, expandScopes, hasScope, isAdmin } from './scopes.js';
import { getScopeEnforcementMode, SCOPE_ENFORCEMENT_MODES } from '../config/index.js';
import { throwUnauthorized, throwForbidden } from '../middleware/responseHelpers.js';
import { logAuthEvent } from '../logging/logger.js';

export { SCOPES, expandScopes, hasScope, isAdmin };

/** Methods that only read. Everything else is treated as a write. */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const asList = (requiredScopes) => (Array.isArray(requiredScopes) ? requiredScopes : [requiredScopes]);

/** What the caller actually holds, for the audit record. */
const grantedList = (user) => [...expandScopes(Array.isArray(user.scopes) ? user.scopes : user.scope)].sort();

const denialDetails = (req, required) => ({
  required: required.join(','),
  actual: grantedList(req.user).join(','),
  method: req.method,
  path: req.originalUrl || req.path,
});

/**
 * Decide one request against one requirement, honouring the enforcement mode.
 * Denials throw (Express forwards a synchronous throw to the error handler).
 */
const decide = (req, requiredScopes, next) => {
  if (getScopeEnforcementMode() === SCOPE_ENFORCEMENT_MODES.OFF) return next();

  if (!req.user) {
    throwUnauthorized('Authentication required');
  }

  const required = asList(requiredScopes);
  if (hasScope(req.user, required)) return next();

  const details = denialDetails(req, required);
  if (getScopeEnforcementMode() === SCOPE_ENFORCEMENT_MODES.WARN) {
    logAuthEvent('SCOPE_WOULD_DENY', req.user.user_id, details, false);
    return next();
  }

  logAuthEvent('SCOPE_DENIED', req.user.user_id, details, false);
  return throwForbidden(`Required scope(s): ${required.join(', ')}`);
};

/**
 * Require specific scope(s) on a route.
 *
 * @param {string|string[]} requiredScopes - Required scope(s)
 * @returns {Function} Express middleware
 *
 * @example
 * router.post('/reset', authenticateJWT, requireScope(SCOPES.ADMIN), handler);
 */
export const requireScope = (requiredScopes) => (req, res, next) => decide(req, requiredScopes, next);

/**
 * Require `read` for safe methods and `write` for everything else — the
 * default gate for every /v2 data router.
 *
 * @returns {Function} Express middleware
 */
export const requireScopeByMethod = () => (req, res, next) => {
  const required = READ_METHODS.has(req.method) ? SCOPES.READ : SCOPES.WRITE;
  return decide(req, required, next);
};

/**
 * Require the admin role or the admin scope. Always enforced.
 *
 * @returns {Function} Express middleware
 */
export const requireAdminRole = () => (req, res, next) => {
  if (!req.user) {
    throwUnauthorized('Authentication required');
  }
  if (!isAdmin(req.user)) {
    logAuthEvent('ADMIN_DENIED', req.user.user_id, {
      method: req.method,
      path: req.originalUrl || req.path,
    }, false);
    throwForbidden('Admin access required');
  }
  return next();
};
