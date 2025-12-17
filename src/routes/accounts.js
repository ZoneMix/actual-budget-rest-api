// src/routes/accounts.js - Full CRUD + extras
import express from 'express';
import { authenticateJWT } from '../auth/jwt.js';
import {
  accountsList,
  accountCreate,
  accountUpdate,
  accountDelete,
  accountClose,
  accountReopen,
  accountBalance
} from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireBodyKeys } from '../middleware/validate.js';

const router = express.Router();
router.use(authenticateJWT);

router.get('/', asyncHandler(async (req, res) => {
  const accounts = await accountsList();
  res.json({ success: true, accounts });
}));

router.post(
  '/',
  requireBodyKeys(['account']),
  asyncHandler(async (req, res) => {
    const { account, initialBalance } = req.body;
    const id = await accountCreate(account, initialBalance);
    res.status(201).json({ success: true, id });
  })
);

router.put(
  '/:id',
  requireBodyKeys(['fields']),
  asyncHandler(async (req, res) => {
    const { fields } = req.body;
    await accountUpdate(req.params.id, fields);
    res.json({ success: true });
  })
);

router.delete('/:id', asyncHandler(async (req, res) => {
  await accountDelete(req.params.id);
  res.json({ success: true });
}));

router.post(
  '/:id/close',
  asyncHandler(async (req, res) => {
    const { transferAccountId, transferCategoryId } = req.body;
    await accountClose(req.params.id, transferAccountId || null, transferCategoryId || null);
    res.json({ success: true });
  })
);

router.post('/:id/reopen', asyncHandler(async (req, res) => {
  await accountReopen(req.params.id);
  res.json({ success: true });
}));

router.get('/:id/balance', asyncHandler(async (req, res) => {
  const cutoff = req.query.cutoff ? new Date(req.query.cutoff) : null;
  const balance = await accountBalance(req.params.id, cutoff);
  res.json({ success: true, balance });
}));

export default router;