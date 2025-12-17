// src/routes/categories.js - CRUD for categories (pattern repeated for other resources)
import express from 'express';
import { authenticateJWT } from '../auth/jwt.js';
import { categoriesList, categoryCreate, categoryUpdate, categoryDelete } from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireBodyKeys } from '../middleware/validate.js';

const router = express.Router();
router.use(authenticateJWT);

router.get('/', asyncHandler(async (req, res) => {
  const categories = await categoriesList();
  res.json({ success: true, categories });
}));

router.post(
  '/',
  requireBodyKeys(['category']),
  asyncHandler(async (req, res) => {
    const { category } = req.body;
    const id = await categoryCreate(category);
    res.status(201).json({ success: true, id });
  })
);

router.put(
  '/:id',
  requireBodyKeys(['fields']),
  asyncHandler(async (req, res) => {
    const { fields } = req.body;
    await categoryUpdate(req.params.id, fields);
    res.json({ success: true });
  })
);

router.delete('/:id', asyncHandler(async (req, res) => {
  await categoryDelete(req.params.id);
  res.json({ success: true });
}));

export default router;