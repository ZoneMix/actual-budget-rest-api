/**
 * GET /v1/audit/changes: the day's Actual sync changes, read-only.
 *
 * Mounted under /v1 on purpose. The edge Caddy lets any Bearer request on
 * /v2/* skip Authentik, so a /v2 path would let this token bypass
 * forward-auth; /v1 stays behind it. There is no write path: GET (and the
 * HEAD Express derives from it) is the only method, everything else is 405.
 */
import express from 'express';
import auditConfig from '../config/audit.js';
import { createAuditTokenAuth } from '../auth/auditToken.js';
import { auditChangesGet } from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { sendSuccess } from '../middleware/responseHelpers.js';
import { validateQuery, AuditChangesQuerySchema } from '../middleware/validation-schemas.js';
import { highFrequencyLimiter } from '../middleware/rateLimiters.js';
import { MethodNotAllowedError } from '../errors/index.js';

const ALLOWED_METHODS = 'GET, HEAD';

const router = express.Router();
const requireAuditToken = createAuditTokenAuth(auditConfig.token);

router.get(
  '/changes',
  highFrequencyLimiter,
  requireAuditToken,
  validateQuery(AuditChangesQuerySchema),
  asyncHandler(async (req, res) => {
    const report = await auditChangesGet(req.validatedQuery);
    res.set('Cache-Control', 'no-store');
    sendSuccess(res, report);
  })
);

router.all('/changes', (_req, res) => {
  res.set('Allow', ALLOWED_METHODS);
  throw new MethodNotAllowedError(ALLOWED_METHODS);
});

export default router;
