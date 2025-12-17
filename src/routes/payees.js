// src/routes/payees.js - CRUD for payees + merge
import express from 'express';
import { authenticateJWT } from '../auth/jwt.js';
import {
  payeesList,
  payeeCreate,
  payeeUpdate,
  payeeDelete,
  payeesMerge
} from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireBodyKeys } from '../middleware/validate.js';

const router = express.Router();
router.use(authenticateJWT);

router.get('/', asyncHandler(async (req, res) => {
  const payees = await payeesList();
  res.json({ success: true, payees });
}));

router.post(
  '/',
  requireBodyKeys(['payee']),
  asyncHandler(async (req, res) => {
    const { payee } = req.body;
    const id = await payeeCreate(payee);
    res.status(201).json({ success: true, id });
  })
);

router.put(
  '/:id',
  requireBodyKeys(['fields']),
  asyncHandler(async (req, res) => {
    const { fields } = req.body;
    await payeeUpdate(req.params.id, fields);
    res.json({ success: true });
  })
);

router.delete('/:id', asyncHandler(async (req, res) => {
  await payeeDelete(req.params.id);
  res.json({ success: true });
}));

router.post(
  '/merge',
  requireBodyKeys(['targetId', 'mergeIds']),
  asyncHandler(async (req, res) => {
    const { targetId, mergeIds } = req.body;
    if (!Array.isArray(mergeIds)) {
      return res.status(400).json({ error: 'targetId and mergeIds array required' });
    }
    await payeesMerge(targetId, mergeIds);
    res.json({ success: true });
  })
);

export default router;