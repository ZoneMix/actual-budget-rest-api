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
import { requireBodyKeys } from '../middleware/validate.js';

const router = express.Router();
router.use(authenticateJWT);

router.get('/months', asyncHandler(async (req, res) => {
  const months = await budgetMonthsList();
  res.json({ success: true, months });
}));

router.get('/:month', asyncHandler(async (req, res) => {
  const budget = await budgetMonthGet(req.params.month);
  res.json({ success: true, budget });
}));

router.post(
  '/:month/categories/:categoryId/budget',
  requireBodyKeys(['amount']),
  asyncHandler(async (req, res) => {
    const { amount } = req.body;
    await budgetSetAmount(req.params.month, req.params.categoryId, amount);
    res.json({ success: true });
  })
);

router.post(
  '/:month/categories/:categoryId/carryover',
  requireBodyKeys(['flag']),
  asyncHandler(async (req, res) => {
    const { flag } = req.body;
    if (typeof flag !== 'boolean') return res.status(400).json({ error: 'flag boolean required' });
    await budgetSetCarryover(req.params.month, req.params.categoryId, flag);
    res.json({ success: true });
  })
);

router.post(
  '/:month/hold',
  requireBodyKeys(['amount']),
  asyncHandler(async (req, res) => {
    const { amount } = req.body;
    await budgetHoldNextMonth(req.params.month, amount);
    res.json({ success: true });
  })
);

router.post('/:month/reset-hold', asyncHandler(async (req, res) => {
  await budgetResetHold(req.params.month);
  res.json({ success: true });
}));

export default router;