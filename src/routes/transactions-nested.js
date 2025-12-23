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
    const addedIds = await transactionsAdd(accountId, transactions, runTransfers, learnCategories);
    res.status(201).json({ success: true, accountId, addedCount: addedIds.length, addedIds });
  })
);

router.post(
  '/import',
  bulkOperationLimiter,
  validateParams(AccountIdParamsSchema),
  validateBody(TransactionsImportSchema),
  asyncHandler(async (req, res) => {
    const accountId = req.validatedParams.accountId;
    const { transactions } = req.validatedBody;
    const result = await transactionsImport(accountId, transactions);
    res.status(201).json({ success: true, accountId, result });
  })
);

export default router;