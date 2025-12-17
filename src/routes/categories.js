// src/routes/categories.js - CRUD for categories (pattern repeated for other resources)
import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateJWT } from '../auth/jwt.js';
import { categoriesList, categoryCreate, categoryUpdate, categoryDelete } from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validateBody, validateParams } from '../middleware/validation-schemas.js';
import { IDSchema, CreateCategorySchema, UpdateCategorySchema } from '../middleware/validation-schemas.js';

const router = express.Router();
router.use(authenticateJWT);

const categoryWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many category operations. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/', asyncHandler(async (req, res) => {
  const categories = await categoriesList();
  res.json({ success: true, categories });
}));

router.post(
  '/',
  categoryWriteLimiter,
  validateBody(CreateCategorySchema),
  asyncHandler(async (req, res) => {
    const { category } = req.validatedBody;
    const id = await categoryCreate(category);
    res.status(201).json({ success: true, id });
  })
);

router.put(
  '/:id',
  categoryWriteLimiter,
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
  categoryWriteLimiter,
  validateParams(IDSchema),
  asyncHandler(async (req, res) => {
    await categoryDelete(req.validatedParams.id);
    res.json({ success: true });
  })
);

export default router;