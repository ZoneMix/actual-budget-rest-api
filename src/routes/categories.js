// src/routes/categories.js - CRUD for categories (pattern repeated for other resources)
import express from 'express';
import { authenticateJWT } from '../auth/jwt.js';
import { requireScopeByMethod } from '../auth/permissions.js';
import { categoriesList, categoryCreate, categoryUpdate, categoryDelete } from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { standardBodyParser } from '../middleware/bodyParser.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validation-schemas.js';
import {
  IDSchema,
  CreateCategorySchema,
  UpdateCategorySchema,
  HiddenQuerySchema,
  DeleteCategoryQuerySchema,
} from '../middleware/validation-schemas.js';
import { standardWriteLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();
router.use(authenticateJWT, requireScopeByMethod());
router.use(standardBodyParser);

router.get(
  '/',
  validateQuery(HiddenQuerySchema),
  asyncHandler(async (req, res) => {
    const categories = await categoriesList(req.validatedQuery);
    res.json({ success: true, categories });
  })
);

router.post(
  '/',
  standardWriteLimiter,
  validateBody(CreateCategorySchema),
  asyncHandler(async (req, res) => {
    const { category } = req.validatedBody;
    const id = await categoryCreate(category);
    res.status(201).json({ success: true, id });
  })
);

router.put(
  '/:id',
  standardWriteLimiter,
  validateParams(IDSchema),
  validateBody(UpdateCategorySchema),
  asyncHandler(async (req, res) => {
    const { fields } = req.validatedBody;
    await categoryUpdate(req.validatedParams.id, fields);
    res.json({ success: true });
  })
);

router.delete(
  '/:id',
  standardWriteLimiter,
  validateParams(IDSchema),
  validateQuery(DeleteCategoryQuerySchema),
  asyncHandler(async (req, res) => {
    await categoryDelete(req.validatedParams.id, req.validatedQuery.transferCategoryId);
    res.json({ success: true });
  })
);

export default router;