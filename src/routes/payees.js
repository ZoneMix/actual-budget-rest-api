// src/routes/payees.js - CRUD for payees + merge
import express from 'express';
import rateLimit from 'express-rate-limit';
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
import { IDSchema, CreatePayeeSchema, UpdatePayeeSchema } from '../middleware/validation-schemas.js';
import { z } from 'zod';

const router = express.Router();
router.use(authenticateJWT);

const payeeWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many payee operations. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/', asyncHandler(async (req, res) => {
  const payees = await payeesList();
  res.json({ success: true, payees });
}));

router.post(
  '/',
  payeeWriteLimiter,
  validateBody(CreatePayeeSchema),
  asyncHandler(async (req, res) => {
    const { payee } = req.validatedBody;
    const id = await payeeCreate(payee);
    res.status(201).json({ success: true, id });
  })
);

router.put(
  '/:id',
  payeeWriteLimiter,
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
  payeeWriteLimiter,
  validateParams(IDSchema),
  asyncHandler(async (req, res) => {
    await payeeDelete(req.validatedParams.id);
    res.json({ success: true });
  })
);

router.post(
  '/merge',
  payeeWriteLimiter,
  validateBody(z.object({
    targetId: z.string().uuid(),
    mergeIds: z.array(z.string().uuid()).min(1),
  })),
  asyncHandler(async (req, res) => {
    const { targetId, mergeIds } = req.validatedBody;
    await payeesMerge(targetId, mergeIds);
    res.json({ success: true });
  })
);

export default router;