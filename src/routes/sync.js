/**
 * On-demand sync with the Actual server. Mounted at /v2/sync.
 *
 * Classified as a write even though it mutates nothing locally: it is an
 * outbound network operation that pushes pending local changes upstream, so a
 * read-only token should not be able to trigger it. `requireScopeByMethod()`
 * already resolves POST to the write scope.
 */
import express from 'express';
import { authenticateJWT } from '../auth/jwt.js';
import { requireScopeByMethod } from '../auth/permissions.js';
import { syncNow } from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { standardWriteLimiter } from '../middleware/rateLimiters.js';
import { sendSuccess } from '../middleware/responseHelpers.js';

const router = express.Router();
router.use(authenticateJWT, requireScopeByMethod());

router.post('/', standardWriteLimiter, asyncHandler(async (req, res) => {
  const syncedAt = await syncNow();
  sendSuccess(res, { syncedAt });
}));

export default router;
