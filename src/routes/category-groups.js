// src/routes/category-groups.js - CRUD for category groups
import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateJWT } from '../auth/jwt.js';
import {
  categoryGroupsList,
  categoryGroupCreate,
  categoryGroupUpdate,
  categoryGroupDelete
} from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validateBody, validateParams } from '../middleware/validation-schemas.js';
import { IDSchema, CreateCategoryGroupSchema, UpdateCategoryGroupSchema } from '../middleware/validation-schemas.js';

const router = express.Router();
router.use(authenticateJWT);

const groupWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many category group operations. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/', asyncHandler(async (req, res) => {
  const groups = await categoryGroupsList();
  res.json({ success: true, categoryGroups: groups });
}));

router.post(
  '/',
  groupWriteLimiter,
  validateBody(CreateCategoryGroupSchema),
  asyncHandler(async (req, res) => {
    const { group } = req.validatedBody;
    const id = await categoryGroupCreate(group);
    res.status(201).json({ success: true, id });
  })
);

router.put(
  '/:id',
  groupWriteLimiter,
  validateParams(IDSchema),
  validateBody(UpdateCategoryGroupSchema),
  asyncHandler(async (req, res) => {
    const { fields } = req.validatedBody;
    const id = await categoryGroupUpdate(req.validatedParams.id, fields);
    res.json({ success: true, id });
  })
);

router.delete(
  '/:id',
  groupWriteLimiter,
  validateParams(IDSchema),
  asyncHandler(async (req, res) => {
    await categoryGroupDelete(req.validatedParams.id);
    res.json({ success: true });
  })
);

export default router;