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
import { requireBodyKeys } from '../middleware/validate.js';

const router = express.Router();
router.use(authenticateJWT);

router.get('/', asyncHandler(async (req, res) => {
  const rules = await rulesList();
  res.json({ success: true, rules });
}));

router.get('/payees/:payeeId', asyncHandler(async (req, res) => {
  const rules = await payeeRulesList(req.params.payeeId);
  res.json({ success: true, payeeId: req.params.payeeId, rules });
}));

router.post(
  '/',
  requireBodyKeys(['rule']),
  asyncHandler(async (req, res) => {
    const { rule } = req.body;
    const newRule = await ruleCreate(rule);
    res.status(201).json({ success: true, rule: newRule });
  })
);

router.put(
  '/:id',
  requireBodyKeys(['fields']),
  asyncHandler(async (req, res) => {
    const { fields } = req.body;
    const updatedRule = await ruleUpdate(req.params.id, fields);
    res.json({ success: true, rule: updatedRule });
  })
);

router.delete('/:id', asyncHandler(async (req, res) => {
  await ruleDelete(req.params.id);
  res.json({ success: true });
}));

export default router;