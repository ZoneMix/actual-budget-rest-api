// src/routes/budgets.js - Budget-specific endpoints
import express from 'express';
import { authenticateJWT } from '../auth/jwt.js';
import { requireScopeByMethod } from '../auth/permissions.js';
import {
  budgetMonthsList,
  budgetMonthGet,
  budgetSetAmount,
  budgetSetCarryover,
  budgetHoldNextMonth,
  budgetResetHold,
  budgetBatchUpdate
} from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { bulkBodyParser, standardBodyParser } from '../middleware/bodyParser.js';
import { validateBody, validateParams } from '../middleware/validation-schemas.js';
import {
  SetBudgetSchema,
  BudgetMonthParamsSchema,
  BudgetCategoryParamsSchema,
  BudgetCarryoverSchema,
  BudgetHoldSchema,
  BatchBudgetSchema,
} from '../middleware/validation-schemas.js';
import { budgetLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();
router.use(authenticateJWT, requireScopeByMethod());

router.get('/months', asyncHandler(async (req, res) => {
  const months = await budgetMonthsList();
  res.json({ success: true, months });
}));

// Registered before the '/:month' routes so Express cannot read "batch" as a
// month. Applies every operation under one engine transaction, in order.
// The bulk parser, not the standard one: 500 operations (the documented
// maximum, BatchBudgetSchema) is ~53 kB of JSON. Mounted per route so the
// smaller parser on the routes below cannot read this body first.
router.post(
  '/batch',
  budgetLimiter,
  bulkBodyParser,
  validateBody(BatchBudgetSchema),
  asyncHandler(async (req, res) => {
    const { operations } = req.validatedBody;
    const applied = await budgetBatchUpdate(operations);
    res.json({ success: true, applied });
  })
);

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
  standardBodyParser,
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
  standardBodyParser,
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
  standardBodyParser,
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