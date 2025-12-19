// src/routes/transactions-global.js - Global update/delete by transaction ID
import express from 'express';
import { authenticateJWT } from '../auth/jwt.js';
import { transactionUpdate, transactionDelete } from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validateBody, validateParams } from '../middleware/validation-schemas.js';
import { IDSchema, UpdateTransactionSchema } from '../middleware/validation-schemas.js';
import { highFrequencyLimiter, standardWriteLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();
router.use(authenticateJWT);

router.put(
  '/:id',
  highFrequencyLimiter,
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
  standardWriteLimiter,
  validateParams(IDSchema),
  asyncHandler(async (req, res) => {
    await transactionDelete(req.validatedParams.id);
    res.json({ success: true });
  })
);

export default router;