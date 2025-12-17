// src/routes/category-groups.js - CRUD for category groups
import express from 'express';
import { authenticateJWT } from '../auth/jwt.js';
import {
  categoryGroupsList,
  categoryGroupCreate,
  categoryGroupUpdate,
  categoryGroupDelete
} from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireBodyKeys } from '../middleware/validate.js';

const router = express.Router();
router.use(authenticateJWT);

router.get('/', asyncHandler(async (req, res) => {
  const groups = await categoryGroupsList();
  res.json({ success: true, categoryGroups: groups });
}));

router.post(
  '/',
  requireBodyKeys(['group']),
  asyncHandler(async (req, res) => {
    const { group } = req.body;
    const id = await categoryGroupCreate(group);
    res.status(201).json({ success: true, id });
  })
);

router.put(
  '/:id',
  requireBodyKeys(['fields']),
  asyncHandler(async (req, res) => {
    const { fields } = req.body;
    const id = await categoryGroupUpdate(req.params.id, fields);
    res.json({ success: true, id });
  })
);

router.delete('/:id', asyncHandler(async (req, res) => {
  await categoryGroupDelete(req.params.id);
  res.json({ success: true });
}));

export default router;