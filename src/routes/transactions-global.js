// src/routes/transactions-global.js - Global update/delete by transaction ID
import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateJWT } from '../auth/jwt.js';
import { transactionUpdate, transactionDelete } from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validateBody, validateParams } from '../middleware/validation-schemas.js';
import { IDSchema, UpdateTransactionSchema } from '../middleware/validation-schemas.js';

const router = express.Router();
router.use(authenticateJWT);

// Rate limiting
const transactionWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many transaction operations. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const transactionDeleteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many delete operations. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.put(
  '/:id',
  transactionWriteLimiter,
  validateParams(IDSchema),
  validateBody(UpdateTransactionSchema),
  asyncHandler(async (req, res) => {
    const { fields } = req.validatedBody;
    await transactionUpdate(req.validatedParams.id, fields);
    res.json({ success: true });
  })
);

router.delete(
  '/:id',
  transactionDeleteLimiter,
  validateParams(IDSchema),
  asyncHandler(async (req, res) => {
    await transactionDelete(req.validatedParams.id);
    res.json({ success: true });
  })
);

export default router;