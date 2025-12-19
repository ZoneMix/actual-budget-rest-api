// src/routes/payees.js - CRUD for payees + merge
import express from 'express';
import { authenticateJWT } from '../auth/jwt.js';
import {
  payeesList,
  payeeCreate,
  payeeUpdate,
  payeeDelete,
  payeesMerge
} from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validateBody, validateParams } from '../middleware/validation-schemas.js';
import { IDSchema, CreatePayeeSchema, UpdatePayeeSchema, MergePayeesSchema } from '../middleware/validation-schemas.js';
import { standardWriteLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();
router.use(authenticateJWT);

router.get('/', asyncHandler(async (req, res) => {
  const payees = await payeesList();
  res.json({ success: true, payees });
}));

router.post(
  '/',
  standardWriteLimiter,
  validateBody(CreatePayeeSchema),
  asyncHandler(async (req, res) => {
    const { payee } = req.validatedBody;
    const id = await payeeCreate(payee);
    res.status(201).json({ success: true, id });
  })
);

router.put(
  '/:id',
  standardWriteLimiter,
  validateParams(IDSchema),
  validateBody(UpdatePayeeSchema),
  asyncHandler(async (req, res) => {
    const { fields } = req.validatedBody;
    await payeeUpdate(req.validatedParams.id, fields);
    res.json({ success: true });
  })
);

router.delete(
  '/:id',
  standardWriteLimiter,
  validateParams(IDSchema),
  asyncHandler(async (req, res) => {
    await payeeDelete(req.validatedParams.id);
    res.json({ success: true });
  })
);

router.post(
  '/merge',
  standardWriteLimiter,
  validateBody(MergePayeesSchema),
  asyncHandler(async (req, res) => {
    const { targetId, mergeIds } = req.validatedBody;
    await payeesMerge(targetId, mergeIds);
    res.json({ success: true });
  })
);

export default router;