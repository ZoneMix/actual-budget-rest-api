/**
 * Name-to-id lookup. Mounted at /v2/lookup.
 *
 * Express decodes path parameters before a handler sees them, so a name with
 * spaces or an apostrophe arrives already decoded and must NOT be decoded
 * again — a second pass would corrupt a name that legitimately contains a
 * percent sequence.
 */
import express from 'express';
import { authenticateJWT } from '../auth/jwt.js';
import { requireScopeByMethod } from '../auth/permissions.js';
import { getIdByName } from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validateParams } from '../middleware/validation-schemas.js';
import { LookupParamsSchema } from '../middleware/validation-schemas.js';
import { sendSuccess } from '../middleware/responseHelpers.js';

const router = express.Router();
router.use(authenticateJWT, requireScopeByMethod());

router.get(
  '/:type/:name',
  validateParams(LookupParamsSchema),
  asyncHandler(async (req, res) => {
    const { type, name } = req.validatedParams;
    // A miss never comes back as null: the engine rejects with its own
    // "Not found" APIError and the service turns that into a NotFoundError.
    const id = await getIdByName(type, name);

    sendSuccess(res, { type, name, id });
  })
);

export default router;
