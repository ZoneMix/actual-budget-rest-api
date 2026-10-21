/**
 * Bearer auth for the audit endpoint, separate from the JWT scheme.
 *
 * LEDGER_AUDIT_TOKEN is a static read-only credential. It is not a JWT, so
 * authenticateJWT rejects it everywhere else: the token opens GET
 * /v1/audit/changes and nothing more. At the edge the /v1 prefix sits outside
 * the Caddy Bearer bypass, so Authentik forward-auth still runs in front.
 */

import crypto from 'crypto';
import { AuthenticationError, ServiceUnavailableError } from '../errors/index.js';
import { TOKEN68_PATTERN } from '../config/audit.js';
import logger from '../logging/logger.js';

const BEARER_PREFIX = 'Bearer ';

// Compare fixed-length digests so timingSafeEqual never sees unequal lengths
// and the comparison time says nothing about the token's length.
const digest = (value) => crypto.createHash('sha256').update(value, 'utf8').digest();

const presentedToken = (req) => {
  const header = req.get('authorization') ?? '';
  if (!header.startsWith(BEARER_PREFIX)) return null;
  const token = header.slice(BEARER_PREFIX.length);
  return TOKEN68_PATTERN.test(token) ? token : null;
};

/**
 * @param {string|null} expectedToken - the configured token; null disables the route
 * @returns {function} Express middleware
 */
export const createAuditTokenAuth = (expectedToken) => {
  const expected = expectedToken ? digest(expectedToken) : null;

  return (req, res, next) => {
    if (!expected) {
      throw new ServiceUnavailableError('The audit endpoint is disabled: LEDGER_AUDIT_TOKEN is not set');
    }
    const token = presentedToken(req);
    if (!token || !crypto.timingSafeEqual(digest(token), expected)) {
      // Never log the presented value, only why it failed.
      logger.warn('Audit token rejected', { requestId: req.id, ip: req.ip, reason: token ? 'mismatch' : 'missing' });
      res.set('WWW-Authenticate', 'Bearer realm="audit"');
      throw new AuthenticationError('A valid audit bearer token is required');
    }
    next();
  };
};
