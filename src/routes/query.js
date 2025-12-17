// src/routes/query.js - Run arbitrary ActualQL query
import express from 'express';
import { authenticateJWT } from '../auth/jwt.js';
import { runActualQuery } from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireBodyKeys } from '../middleware/validate.js';

const router = express.Router();
router.use(authenticateJWT);

router.post(
  '/',
  requireBodyKeys(['query']),
  asyncHandler(async (req, res) => {
    const { query } = req.body;
    if (typeof query !== 'string') return res.status(400).json({ error: 'query string required' });
    const result = await runActualQuery(query);
    res.json({ success: true, result });
  })
);

export default router;