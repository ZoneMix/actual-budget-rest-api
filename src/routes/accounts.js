/**
 * Account management routes.
 *
 * Provides full CRUD operations for accounts plus additional actions:
 * - List all accounts
 * - Create, update, delete accounts
 * - Close/reopen accounts (with optional transfer)
 * - Get account balance (with optional date cutoff)
 *
 * All routes require JWT authentication.
 */
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
import { validateBody, validateParams } from '../middleware/validation-schemas.js';
import { IDSchema, CreateAccountSchema, UpdateAccountSchema, CloseAccountSchema } from '../middleware/validation-schemas.js';
import { standardWriteLimiter, deleteLimiter } from '../middleware/rateLimiters.js';
import { sendSuccess, sendCreated } from '../middleware/responseHelpers.js';

const router = express.Router();
router.use(authenticateJWT);

router.get('/', asyncHandler(async (req, res) => {
  const accounts = await accountsList();
  sendSuccess(res, { accounts });
}));

router.post(
  '/',
  standardWriteLimiter,
  validateBody(CreateAccountSchema),
  asyncHandler(async (req, res) => {
    const { account, initialBalance } = req.validatedBody;
    const id = await accountCreate(account, initialBalance);
    sendCreated(res, { id });
  })
);

router.put(
  '/:id',
  standardWriteLimiter,
  validateParams(IDSchema),
  validateBody(UpdateAccountSchema),
  asyncHandler(async (req, res) => {
    const { fields } = req.validatedBody;
    await accountUpdate(req.validatedParams.id, fields);
    sendSuccess(res);
  })
);

router.delete(
  '/:id',
  deleteLimiter,
  validateParams(IDSchema),
  asyncHandler(async (req, res) => {
    await accountDelete(req.validatedParams.id);
    sendSuccess(res);
  })
);

router.post(
  '/:id/close',
  standardWriteLimiter,
  validateParams(IDSchema),
  validateBody(CloseAccountSchema),
  asyncHandler(async (req, res) => {
    const { transferAccountId, transferCategoryId } = req.validatedBody;
    await accountClose(req.validatedParams.id, transferAccountId || undefined, transferCategoryId || undefined);
    sendSuccess(res);
  })
);

router.post(
  '/:id/reopen',
  standardWriteLimiter,
  validateParams(IDSchema),
  asyncHandler(async (req, res) => {
    await accountReopen(req.validatedParams.id);
    sendSuccess(res);
  })
);

router.get(
  '/:id/balance',
  validateParams(IDSchema),
  asyncHandler(async (req, res) => {
    const cutoff = req.query.cutoff ? new Date(req.query.cutoff) : undefined;
    const balance = await accountBalance(req.validatedParams.id, cutoff);
    sendSuccess(res, { balance });
  })
);

export default router;