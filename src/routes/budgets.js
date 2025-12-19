// src/routes/budgets.js - Budget-specific endpoints
import express from 'express';
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
import {
  SetBudgetSchema,
  BudgetMonthParamsSchema,
  BudgetCategoryParamsSchema,
  BudgetCarryoverSchema,
  BudgetHoldSchema,
} from '../middleware/validation-schemas.js';
import { budgetLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();
router.use(authenticateJWT);

router.get('/months', asyncHandler(async (req, res) => {
  const months = await budgetMonthsList();
  res.json({ success: true, months });
}));

router.get(
  '/:month',
  validateParams(BudgetMonthParamsSchema),
  asyncHandler(async (req, res) => {
    const budget = await budgetMonthGet(req.validatedParams.month);
    res.json({ success: true, budget });
  })
);

router.post(
  '/:month/categories/:categoryId/budget',
  budgetLimiter,
  validateParams(BudgetCategoryParamsSchema),
  validateBody(SetBudgetSchema),
  asyncHandler(async (req, res) => {
    const { amount } = req.validatedBody;
    await budgetSetAmount(req.validatedParams.month, req.validatedParams.categoryId, amount);
    res.json({ success: true });
  })
);

router.post(
  '/:month/categories/:categoryId/carryover',
  budgetLimiter,
  validateParams(BudgetCategoryParamsSchema),
  validateBody(BudgetCarryoverSchema),
  asyncHandler(async (req, res) => {
    const { flag } = req.validatedBody;
    await budgetSetCarryover(req.validatedParams.month, req.validatedParams.categoryId, flag);
    res.json({ success: true });
  })
);

router.post(
  '/:month/hold',
  budgetLimiter,
  validateParams(BudgetMonthParamsSchema),
  validateBody(BudgetHoldSchema),
  asyncHandler(async (req, res) => {
    const { amount } = req.validatedBody;
    await budgetHoldNextMonth(req.validatedParams.month, amount);
    res.json({ success: true });
  })
);

router.post(
  '/:month/reset-hold',
  budgetLimiter,
  validateParams(BudgetMonthParamsSchema),
  asyncHandler(async (req, res) => {
    await budgetResetHold(req.validatedParams.month);
    res.json({ success: true });
  })
);

export default router;