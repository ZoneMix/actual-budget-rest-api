// src/routes/accounts.js - Full CRUD + extras
import express from 'express';
import rateLimit from 'express-rate-limit';
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
import { validateBody, validateParams } from '../middleware/validation-schemas.js';
import { IDSchema, CreateAccountSchema, UpdateAccountSchema, CloseAccountSchema } from '../middleware/validation-schemas.js';

const router = express.Router();
router.use(authenticateJWT);

// Rate limiting for write operations
const accountWriteLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: { error: 'Too many account operations. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const accountDeleteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many delete operations. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/', asyncHandler(async (req, res) => {
  const accounts = await accountsList();
  res.json({ success: true, accounts });
}));

router.post(
  '/',
  accountWriteLimiter,
  validateBody(CreateAccountSchema),
  asyncHandler(async (req, res) => {
    const { account, initialBalance } = req.validatedBody;
    const id = await accountCreate(account, initialBalance);
    res.status(201).json({ success: true, id });
  })
);

router.put(
  '/:id',
  accountWriteLimiter,
  validateParams(IDSchema),
  validateBody(UpdateAccountSchema),
  asyncHandler(async (req, res) => {
    const { fields } = req.validatedBody;
    await accountUpdate(req.validatedParams.id, fields);
    res.json({ success: true });
  })
);

router.delete(
  '/:id',
  accountDeleteLimiter,
  validateParams(IDSchema),
  asyncHandler(async (req, res) => {
    await accountDelete(req.validatedParams.id);
    res.json({ success: true });
  })
);

router.post(
  '/:id/close',
  accountWriteLimiter,
  validateParams(IDSchema),
  validateBody(CloseAccountSchema),
  asyncHandler(async (req, res) => {
    const { transferAccountId, transferCategoryId } = req.validatedBody;
    await accountClose(req.validatedParams.id, transferAccountId || null, transferCategoryId || null);
    res.json({ success: true });
  })
);

router.post(
  '/:id/reopen',
  accountWriteLimiter,
  validateParams(IDSchema),
  asyncHandler(async (req, res) => {
    await accountReopen(req.validatedParams.id);
    res.json({ success: true });
  })
);

router.get(
  '/:id/balance',
  validateParams(IDSchema),
  asyncHandler(async (req, res) => {
    const cutoff = req.query.cutoff ? new Date(req.query.cutoff) : null;
    const balance = await accountBalance(req.validatedParams.id, cutoff);
    res.json({ success: true, balance });
  })
);

export default router;