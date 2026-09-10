// src/routes/transactions-nested.js - Nested under /accounts/:accountId/transactions
import express from 'express';
import { transactionsList, transactionsAdd, transactionsImport } from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validateBody, validateParams } from '../middleware/validation-schemas.js';
import {
  AccountIdParamsSchema,
  TransactionsAddSchema,
  TransactionsImportSchema,
} from '../middleware/validation-schemas.js';
import { bulkOperationLimiter } from '../middleware/rateLimiters.js';
import { bulkBodyParser } from '../middleware/bodyParser.js';

// `addedCount` is kept only so existing clients don't break. The engine
// resolves addTransactions with the string 'ok', so no per-transaction id or
// real added count is available; both counts report what was submitted.
const ADDED_COUNT_DEPRECATION_HEADERS = Object.freeze({
  Deprecation: 'true',
  Warning: '299 - "addedCount is deprecated; use submittedCount. Removed in 3.0.0"',
});

const router = express.Router({ mergeParams: true }); // Important: mergeParams to access :accountId

// Use larger body parser for bulk operations
router.use(bulkBodyParser);

router.get(
  '/',
  validateParams(AccountIdParamsSchema),
  asyncHandler(async (req, res) => {
    const accountId = req.validatedParams.accountId;
    const start = req.query.start || undefined; // YYYY-MM-DD per Actual API reference
    const end = req.query.end || undefined;   // YYYY-MM-DD per Actual API reference
    const transactions = await transactionsList(accountId, start, end);
    res.json({ success: true, accountId, transactions });
  })
);

router.post(
  '/',
  bulkOperationLimiter,
  validateParams(AccountIdParamsSchema),
  validateBody(TransactionsAddSchema),
  asyncHandler(async (req, res) => {
    const accountId = req.validatedParams.accountId;
    const { transactions, runTransfers, learnCategories } = req.validatedBody;
    const result = await transactionsAdd(accountId, transactions, runTransfers, learnCategories);
    res.set(ADDED_COUNT_DEPRECATION_HEADERS);
    res.status(201).json({
      success: true,
      accountId,
      result,
      submittedCount: transactions.length,
      addedCount: transactions.length,
    });
  })
);

router.post(
  '/import',
  bulkOperationLimiter,
  validateParams(AccountIdParamsSchema),
  validateBody(TransactionsImportSchema),
  asyncHandler(async (req, res) => {
    const accountId = req.validatedParams.accountId;
    const { transactions, opts } = req.validatedBody;
    const result = await transactionsImport(accountId, transactions, opts);
    res.status(201).json({ success: true, accountId, result });
  })
);

export default router;