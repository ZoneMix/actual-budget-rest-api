import express from 'express';
import { authenticateJWT } from '../auth/jwt.js';
import { getTransactions, addTransactions } from '../services/actualApi.js';

const router = express.Router();
router.use(authenticateJWT);

// POST /transactions/:accountId? or /
router.post('/:accountId', async (req, res) => {
  let accountId = req.params.accountId || process.env.ACTUAL_DEFAULT_ACCOUNT_ID;
  if (!accountId) return res.status(400).json({ error: 'Account ID required' });

  const { transactions } = req.body;
  if (!Array.isArray(transactions)) return res.status(400).json({ error: 'transactions array required' });

  try {
    await addTransactions(accountId, transactions.map(tx => ({ account: accountId, ...tx })));
    const allTransactions = await getTransactions(accountId);
    res.status(201).json({ success: true, accountId, addedCount: transactions.length, transactions: allTransactions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /transactions/:accountId – just await getTransactions(accountId)
router.get('/:accountId', async (req, res) => {
  let accountId = req.params.accountId || process.env.ACTUAL_DEFAULT_ACCOUNT_ID;
  if (!accountId) return res.status(400).json({ error: 'Account ID required' });

  try {
    const transactions = await getTransactions(accountId);
    res.status(201).json({ success: true, accountId, transactionsCount: transactions.length, transactions: transactions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;