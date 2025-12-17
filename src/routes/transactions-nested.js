// src/routes/transactions-nested.js - Nested under /accounts/:accountId/transactions
import express from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { transactionsList, transactionsAdd, transactionsImport } from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validateBody, validateParams } from '../middleware/validation-schemas.js';
import { CreateTransactionSchema } from '../middleware/validation-schemas.js';

const router = express.Router({ mergeParams: true }); // Important: mergeParams to access :accountId

const transactionBulkLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 50,
  message: { error: 'Too many bulk transaction operations. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get(
  '/',
  validateParams(z.object({ accountId: z.string().uuid() })),
  asyncHandler(async (req, res) => {
    const accountId = req.validatedParams.accountId;
    const start = req.query.start ?? null; // YYYY-MM-DD per Actual API reference
    const end = req.query.end ?? null;     // YYYY-MM-DD per Actual API reference
    const transactions = await transactionsList(accountId, start, end);
    res.json({ success: true, accountId, transactions });
  })
);

router.post(
  '/',
  transactionBulkLimiter,
  validateParams(z.object({ accountId: z.string().uuid() })),
  validateBody(z.object({
    transactions: z.array(CreateTransactionSchema),
    runTransfers: z.boolean().optional().default(false),
    learnCategories: z.boolean().optional().default(false),
  })),
  asyncHandler(async (req, res) => {
    const accountId = req.validatedParams.accountId;
    const { transactions, runTransfers, learnCategories } = req.validatedBody;
    const addedIds = await transactionsAdd(accountId, transactions, runTransfers, learnCategories);
    res.status(201).json({ success: true, accountId, addedCount: addedIds.length, addedIds });
  })
);

router.post(
  '/import',
  transactionBulkLimiter,
  validateParams(z.object({ accountId: z.string().uuid() })),
  validateBody(z.object({
    transactions: z.array(CreateTransactionSchema),
  })),
  asyncHandler(async (req, res) => {
    const accountId = req.validatedParams.accountId;
    const { transactions } = req.validatedBody;
    const result = await transactionsImport(accountId, transactions);
    res.status(201).json({ success: true, accountId, result });
  })
);

export default router;