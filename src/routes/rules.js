// src/routes/rules.js - CRUD for rules + payee-specific rules
import express from 'express';
import { authenticateJWT } from '../auth/jwt.js';
import {
  rulesList,
  payeeRulesList,
  ruleCreate,
  ruleUpdate,
  ruleDelete
} from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validateBody, validateParams } from '../middleware/validation-schemas.js';
import { IDSchema, CreateRuleSchema, UpdateRuleSchema, PayeeIdParamsSchema } from '../middleware/validation-schemas.js';
import { standardWriteLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();
router.use(authenticateJWT);

router.get('/', asyncHandler(async (req, res) => {
  const rules = await rulesList();
  res.json({ success: true, rules });
}));

router.get(
  '/payees/:payeeId',
  validateParams(PayeeIdParamsSchema),
  asyncHandler(async (req, res) => {
    const rules = await payeeRulesList(req.validatedParams.payeeId);
    res.json({ success: true, payeeId: req.validatedParams.payeeId, rules });
  })
);

router.post(
  '/',
  standardWriteLimiter,
  validateBody(CreateRuleSchema),
  asyncHandler(async (req, res) => {
    const { rule } = req.validatedBody;
    const newRule = await ruleCreate(rule);
    res.status(201).json({ success: true, rule: newRule });
  })
);

router.put(
  '/:id',
  standardWriteLimiter,
  validateParams(IDSchema),
  validateBody(UpdateRuleSchema),
  asyncHandler(async (req, res) => {
    const { fields } = req.validatedBody;
    const updatedRule = await ruleUpdate(req.validatedParams.id, fields);
    res.json({ success: true, rule: updatedRule });
  })
);

router.delete(
  '/:id',
  standardWriteLimiter,
  validateParams(IDSchema),
  asyncHandler(async (req, res) => {
    await ruleDelete(req.validatedParams.id);
    res.json({ success: true });
  })
);

export default router;