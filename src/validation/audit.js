/**
 * Query schema for GET /v1/audit/changes.
 */

import { z } from 'zod';
import { DateStringSchema } from './common.js';
import { AUDIT_DEFAULT_LIMIT, AUDIT_MAX_LIMIT } from '../config/audit.js';

/** Rejects shape-valid but impossible dates such as 2026-02-30. */
const isCalendarDate = (value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

export const AuditChangesQuerySchema = z.strictObject({
  // Omitted means today in AUDIT_TIMEZONE, resolved by the service.
  date: DateStringSchema.refine(isCalendarDate, 'Date must be a real calendar date').optional(),
  limit: z.coerce.number().int().min(1).max(AUDIT_MAX_LIMIT).default(AUDIT_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});
