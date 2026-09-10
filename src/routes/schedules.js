// src/routes/schedules.js - CRUD for schedules
import express from 'express';
import { authenticateJWT } from '../auth/jwt.js';
import { requireScopeByMethod } from '../auth/permissions.js';
import {
  schedulesList,
  scheduleCreate,
  scheduleUpdate,
  scheduleDelete
} from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validation-schemas.js';
import {
  IDSchema,
  CreateScheduleSchema,
  UpdateScheduleSchema,
  ScheduleUpdateQuerySchema,
} from '../middleware/validation-schemas.js';
import { standardWriteLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();
router.use(authenticateJWT, requireScopeByMethod());

router.get('/', asyncHandler(async (req, res) => {
  const schedules = await schedulesList();
  res.json({ success: true, schedules });
}));

router.post(
  '/',
  standardWriteLimiter,
  validateBody(CreateScheduleSchema),
  asyncHandler(async (req, res) => {
    const { schedule } = req.validatedBody;
    const id = await scheduleCreate(schedule);
    res.status(201).json({ success: true, id });
  })
);

router.put(
  '/:id',
  standardWriteLimiter,
  validateParams(IDSchema),
  validateQuery(ScheduleUpdateQuerySchema),
  validateBody(UpdateScheduleSchema),
  asyncHandler(async (req, res) => {
    const { fields } = req.validatedBody;
    // Stays undefined when the caller omits it, so the engine keeps its default.
    const { resetNextDate } = req.validatedQuery;
    const updated = await scheduleUpdate(req.validatedParams.id, fields, resetNextDate);
    res.json({ success: true, schedule: updated });
  })
);

router.delete(
  '/:id',
  standardWriteLimiter,
  validateParams(IDSchema),
  asyncHandler(async (req, res) => {
    await scheduleDelete(req.validatedParams.id);
    res.json({ success: true });
  })
);

export default router;