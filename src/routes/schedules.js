// src/routes/schedules.js - CRUD for schedules
import express from 'express';
import { authenticateJWT } from '../auth/jwt.js';
import {
  schedulesList,
  scheduleCreate,
  scheduleUpdate,
  scheduleDelete
} from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireBodyKeys } from '../middleware/validate.js';

const router = express.Router();
router.use(authenticateJWT);

router.get('/', asyncHandler(async (req, res) => {
  const schedules = await schedulesList();
  res.json({ success: true, schedules });
}));

router.post(
  '/',
  requireBodyKeys(['schedule']),
  asyncHandler(async (req, res) => {
    const { schedule } = req.body;
    const id = await scheduleCreate(schedule);
    res.status(201).json({ success: true, id });
  })
);

router.put(
  '/:id',
  requireBodyKeys(['fields']),
  asyncHandler(async (req, res) => {
    const { fields } = req.body;
    const updated = await scheduleUpdate(req.params.id, fields);
    res.json({ success: true, schedule: updated });
  })
);

router.delete('/:id', asyncHandler(async (req, res) => {
  await scheduleDelete(req.params.id);
  res.json({ success: true });
}));

export default router;