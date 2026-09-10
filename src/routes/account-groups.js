// src/routes/account-groups.js - CRUD for account groups (sidebar folders)
import express from 'express';
import { authenticateJWT } from '../auth/jwt.js';
import { requireScopeByMethod } from '../auth/permissions.js';
import {
  accountGroupsList,
  accountGroupCreate,
  accountGroupUpdate,
  accountGroupDelete
} from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validateBody, validateParams } from '../middleware/validation-schemas.js';
import {
  IDSchema,
  CreateAccountGroupSchema,
  UpdateAccountGroupSchema,
} from '../middleware/validation-schemas.js';
import { standardWriteLimiter, deleteLimiter } from '../middleware/rateLimiters.js';
import { sendSuccess, sendCreated } from '../middleware/responseHelpers.js';

const router = express.Router();
router.use(authenticateJWT, requireScopeByMethod());

router.get('/', asyncHandler(async (req, res) => {
  const accountGroups = await accountGroupsList();
  sendSuccess(res, { accountGroups });
}));

router.post(
  '/',
  standardWriteLimiter,
  validateBody(CreateAccountGroupSchema),
  asyncHandler(async (req, res) => {
    const { group } = req.validatedBody;
    const id = await accountGroupCreate(group);
    sendCreated(res, { id });
  })
);

router.put(
  '/:id',
  standardWriteLimiter,
  validateParams(IDSchema),
  validateBody(UpdateAccountGroupSchema),
  asyncHandler(async (req, res) => {
    const { fields } = req.validatedBody;
    await accountGroupUpdate(req.validatedParams.id, fields);
    sendSuccess(res);
  })
);

router.delete(
  '/:id',
  deleteLimiter,
  validateParams(IDSchema),
  asyncHandler(async (req, res) => {
    await accountGroupDelete(req.validatedParams.id);
    sendSuccess(res);
  })
);

export default router;
