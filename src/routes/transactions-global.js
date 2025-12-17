// src/routes/transactions-global.js - Global update/delete by transaction ID
import express from 'express';
import { authenticateJWT } from '../auth/jwt.js';
import { transactionUpdate, transactionDelete } from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireBodyKeys } from '../middleware/validate.js';

const router = express.Router();
router.use(authenticateJWT);

router.put(
  '/:id',
  requireBodyKeys(['fields']),
  asyncHandler(async (req, res) => {
    const { fields } = req.body;
    await transactionUpdate(req.params.id, fields);
    res.json({ success: true });
  })
);

router.delete('/:id', asyncHandler(async (req, res) => {
  await transactionDelete(req.params.id);
  res.json({ success: true });
}));

export default router;