// src/routes/transactions-nested.js - Nested under /accounts/:accountId/transactions
import express from 'express';
import { transactionsList, transactionsAdd, transactionsImport } from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireBodyKeys } from '../middleware/validate.js';

const router = express.Router({ mergeParams: true }); // Important: mergeParams to access :accountId

router.get('/', asyncHandler(async (req, res) => {
  const accountId = req.params.accountId;
  const start = req.query.start ?? null; // YYYY-MM-DD per Actual API reference
  const end = req.query.end ?? null;     // YYYY-MM-DD per Actual API reference
  const transactions = await transactionsList(accountId, start, end);
  res.json({ success: true, accountId, transactions });
}));

router.post(
  '/',
  requireBodyKeys(['transactions']),
  asyncHandler(async (req, res) => {
    const accountId = req.params.accountId;
    const { transactions, runTransfers = false, learnCategories = false } = req.body;
    if (!Array.isArray(transactions)) return res.status(400).json({ error: 'transactions array required' });
    const addedIds = await transactionsAdd(accountId, transactions, runTransfers, learnCategories);
    res.status(201).json({ success: true, accountId, addedCount: addedIds.length, addedIds });
  })
);

router.post(
  '/import',
  requireBodyKeys(['transactions']),
  asyncHandler(async (req, res) => {
    const accountId = req.params.accountId;
    const { transactions } = req.body;
    if (!Array.isArray(transactions)) return res.status(400).json({ error: 'transactions array required' });
    const result = await transactionsImport(accountId, transactions);
    res.status(201).json({ success: true, accountId, result });
  })
);

export default router;