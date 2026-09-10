// src/routes/tags.js - CRUD for transaction tags
import express from 'express';
import { authenticateJWT } from '../auth/jwt.js';
import { requireScopeByMethod } from '../auth/permissions.js';
import { tagsList, tagCreate, tagUpdate, tagDelete } from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validateBody, validateParams } from '../middleware/validation-schemas.js';
import { IDSchema, CreateTagSchema, UpdateTagSchema } from '../middleware/validation-schemas.js';
import { standardWriteLimiter, deleteLimiter } from '../middleware/rateLimiters.js';
import { sendSuccess, sendCreated } from '../middleware/responseHelpers.js';

const router = express.Router();
router.use(authenticateJWT, requireScopeByMethod());

router.get('/', asyncHandler(async (req, res) => {
  const tags = await tagsList();
  sendSuccess(res, { tags });
}));

router.post(
  '/',
  standardWriteLimiter,
  validateBody(CreateTagSchema),
  asyncHandler(async (req, res) => {
    const { tag } = req.validatedBody;
    const id = await tagCreate(tag);
    sendCreated(res, { id });
  })
);

router.put(
  '/:id',
  standardWriteLimiter,
  validateParams(IDSchema),
  validateBody(UpdateTagSchema),
  asyncHandler(async (req, res) => {
    const { fields } = req.validatedBody;
    await tagUpdate(req.validatedParams.id, fields);
    sendSuccess(res);
  })
);

router.delete(
  '/:id',
  deleteLimiter,
  validateParams(IDSchema),
  asyncHandler(async (req, res) => {
    await tagDelete(req.validatedParams.id);
    sendSuccess(res);
  })
);

export default router;
