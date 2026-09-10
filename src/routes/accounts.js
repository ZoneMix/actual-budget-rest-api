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
import { requireScopeByMethod } from '../auth/permissions.js';
import {
  accountsList,
  accountCreate,
  accountUpdate,
  accountDelete,
  accountClose,
  accountReopen,
  accountBalance,
  bankSync
} from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { standardBodyParser } from '../middleware/bodyParser.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validation-schemas.js';
import {
  IDSchema,
  CreateAccountSchema,
  UpdateAccountSchema,
  CloseAccountSchema,
  AccountBalanceQuerySchema,
  AccountIdParamsSchema,
} from '../middleware/validation-schemas.js';
import { standardWriteLimiter, deleteLimiter } from '../middleware/rateLimiters.js';
import { sendSuccess, sendCreated } from '../middleware/responseHelpers.js';
import transactionsNestedRoutes from './transactions-nested.js';

const router = express.Router();
router.use(authenticateJWT, requireScopeByMethod());

router.get('/', asyncHandler(async (req, res) => {
  const accounts = await accountsList();
  sendSuccess(res, { accounts });
}));

router.post(
  '/',
  standardWriteLimiter,
  standardBodyParser,
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
  standardBodyParser,
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
  standardBodyParser,
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
  validateQuery(AccountBalanceQuerySchema),
  asyncHandler(async (req, res) => {
    // Validated upstream, so `new Date` here can never produce an Invalid Date.
    const { cutoff } = req.validatedQuery;
    const balance = await accountBalance(req.validatedParams.id, cutoff ? new Date(cutoff) : undefined);
    sendSuccess(res, { balance });
  })
);

// Pulls new transactions from the account's linked bank. A write: it creates
// transactions. Uses AccountIdParamsSchema (a strict UUID) rather than the
// looser IDSchema the other account routes take, because runBankSync resolves
// the id against the bank link rather than the local account table.
router.post(
  '/:accountId/bank-sync',
  standardWriteLimiter,
  validateParams(AccountIdParamsSchema),
  asyncHandler(async (req, res) => {
    const { accountId } = req.validatedParams;
    await bankSync(accountId);
    sendSuccess(res, { accountId });
  })
);

// Nested per-account transactions. The parsers above are mounted per ROUTE,
// not with router.use(): this router owns the nested transactions router below,
// which mounts the 1 mb bulk parser, and a router-level parser here would read
// those bodies first and cap them at the ordinary limit.
//
// Mounted once here at module load —
// NOT inside createApp() — since accountsRoutes is a module-singleton
// shared across every createApp() call; mounting it there would stack a
// duplicate layer on this router each time createApp() runs (e.g. once
// per test in a test file).
router.use('/:accountId/transactions', transactionsNestedRoutes);

export default router;