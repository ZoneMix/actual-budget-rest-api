// src/routes/budgets.js - Budget-specific endpoints
import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateJWT } from '../auth/jwt.js';
import {
  budgetMonthsList,
  budgetMonthGet,
  budgetSetAmount,
  budgetSetCarryover,
  budgetHoldNextMonth,
  budgetResetHold
} from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validateBody, validateParams } from '../middleware/validation-schemas.js';
import { SetBudgetSchema } from '../middleware/validation-schemas.js';
import { z } from 'zod';

const router = express.Router();
router.use(authenticateJWT);

const budgetWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many budget operations. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/months', asyncHandler(async (req, res) => {
  const months = await budgetMonthsList();
  res.json({ success: true, months });
}));

router.get(
  '/:month',
  validateParams(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) })),
  asyncHandler(async (req, res) => {
    const budget = await budgetMonthGet(req.validatedParams.month);
    res.json({ success: true, budget });
  })
);

router.post(
  '/:month/categories/:categoryId/budget',
  budgetWriteLimiter,
  validateParams(z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    categoryId: z.string().uuid(),
  })),
  validateBody(SetBudgetSchema),
  asyncHandler(async (req, res) => {
    const { amount } = req.validatedBody;
    await budgetSetAmount(req.validatedParams.month, req.validatedParams.categoryId, amount);
    res.json({ success: true });
  })
);

router.post(
  '/:month/categories/:categoryId/carryover',
  budgetWriteLimiter,
  validateParams(z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    categoryId: z.string().uuid(),
  })),
  validateBody(z.object({ flag: z.boolean() })),
  asyncHandler(async (req, res) => {
    const { flag } = req.validatedBody;
    await budgetSetCarryover(req.validatedParams.month, req.validatedParams.categoryId, flag);
    res.json({ success: true });
  })
);

router.post(
  '/:month/hold',
  budgetWriteLimiter,
  validateParams(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) })),
  validateBody(z.object({ amount: z.number() })),
  asyncHandler(async (req, res) => {
    const { amount } = req.validatedBody;
    await budgetHoldNextMonth(req.validatedParams.month, amount);
    res.json({ success: true });
  })
);

router.post(
  '/:month/reset-hold',
  budgetWriteLimiter,
  validateParams(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) })),
  asyncHandler(async (req, res) => {
    await budgetResetHold(req.validatedParams.month);
  res.json({ success: true });
}));

export default router;