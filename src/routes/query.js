// src/routes/query.js - Run arbitrary ActualQL query
import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateJWT } from '../auth/jwt.js';
import { runActualQuery } from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validateBody } from '../middleware/validation-schemas.js';
import { QuerySchema } from '../middleware/validation-schemas.js';

const router = express.Router();
router.use(authenticateJWT);

// Stricter rate limit for query endpoint (arbitrary SQL-like queries)
const queryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many query requests. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

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