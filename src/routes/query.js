// src/routes/query.js - Run arbitrary ActualQL query
import express from 'express';
import { authenticateJWT } from '../auth/jwt.js';
import { runActualQuery } from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validateBody } from '../middleware/validation-schemas.js';
import { QuerySchema } from '../middleware/validation-schemas.js';
import { queryLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();
router.use(authenticateJWT);

router.post(
  '/',
  queryLimiter,
  validateBody(QuerySchema),
  asyncHandler(async (req, res) => {
    const { query } = req.validatedBody;
    const result = await runActualQuery(query);
    res.json({ success: true, result });
  })
);

export default router;