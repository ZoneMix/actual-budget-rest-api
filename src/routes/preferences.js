/**
 * Read-only view of the budget's synced preferences.
 *
 * The engine owns this key space and adds to it between releases, so the
 * object is passed through unchanged rather than projected onto a fixed shape.
 * There is no write counterpart: `@actual-app/api` 26.9.0 exposes no
 * setPreference (methods.d.ts).
 */
import express from 'express';
import { authenticateJWT } from '../auth/jwt.js';
import { requireScopeByMethod } from '../auth/permissions.js';
import { preferencesGet } from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { sendSuccess } from '../middleware/responseHelpers.js';

const router = express.Router();
router.use(authenticateJWT, requireScopeByMethod());

router.get('/', asyncHandler(async (req, res) => {
  const preferences = await preferencesGet();
  sendSuccess(res, { preferences });
}));

export default router;
