import express from 'express';
import { authenticateJWT } from '../auth/jwt.js';
import { getActualApi } from '../services/actualApi.js';

const router = express.Router();
router.use(authenticateJWT);

router.post('/:accountId', async (req, res) => {
  const accountId = req.params.accountId || process.env.ACTUAL_DEFAULT_ACCOUNT_ID;
  const { transactions } = req.body;

  if (!accountId) return res.status(400).json({ error: 'Account ID required' });
  if (!Array.isArray(transactions)) return res.status(400).json({ error: 'transactions array required' });

  try {
    const api = await getActualApi();
    await api.sync();

    const enriched = transactions.map(t => ({ account: accountId, ...t }));
    await api.addTransactions(accountId, enriched);
    await api.sync();

    const updated = await api.getTransactions(accountId);

    res.status(201).json({
      success: true,
      accountId,
      addedCount: enriched.length,
      updatedBudget: updated,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:accountId', async (req, res) => {
  const accountId = req.params.accountId || process.env.ACTUAL_DEFAULT_ACCOUNT_ID;
  if (!accountId) return res.status(400).json({ error: 'Account ID required' });

  try {
    const api = await getActualApi();
    await api.sync();
    const txs = await api.getTransactions(accountId);
    res.json({ success: true, accountId, transactions: txs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;