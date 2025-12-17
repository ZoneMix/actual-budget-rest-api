// src/routes/schedules.js - CRUD for schedules
import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateJWT } from '../auth/jwt.js';
import {
  schedulesList,
  scheduleCreate,
  scheduleUpdate,
  scheduleDelete
} from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validateBody, validateParams } from '../middleware/validation-schemas.js';
import { IDSchema, CreateScheduleSchema, UpdateScheduleSchema } from '../middleware/validation-schemas.js';

const router = express.Router();
router.use(authenticateJWT);

const scheduleWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many schedule operations. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/', asyncHandler(async (req, res) => {
  const schedules = await schedulesList();
  res.json({ success: true, schedules });
}));

router.post(
  '/',
  scheduleWriteLimiter,
  validateBody(CreateScheduleSchema),
  asyncHandler(async (req, res) => {
    const { schedule } = req.validatedBody;
    const id = await scheduleCreate(schedule);
    res.status(201).json({ success: true, id });
  })
);

router.put(
  '/:id',
  scheduleWriteLimiter,
  validateParams(IDSchema),
  validateBody(UpdateScheduleSchema),
  asyncHandler(async (req, res) => {
    const { fields } = req.validatedBody;
    const updated = await scheduleUpdate(req.validatedParams.id, fields);
    res.json({ success: true, schedule: updated });
  })
);

router.delete(
  '/:id',
  scheduleWriteLimiter,
  validateParams(IDSchema),
  asyncHandler(async (req, res) => {
    await scheduleDelete(req.validatedParams.id);
    res.json({ success: true });
  })
);

export default router;