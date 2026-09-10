/**
 * Schedule schemas.
 */
import { z } from 'zod';

const DateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

const RecurringDateSchema = z.object({
  start: z.string(),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval: z.number().int().min(1).optional(),
  patterns: z.array(z.unknown()).optional(),
  skipWeekend: z.boolean().optional(),
  weekendSolveMode: z.enum(['before', 'after']).optional(),
  endMode: z.string().optional(),
  endOccurrences: z.number().int().optional(),
  endDate: z.string().optional(),
});

export const ScheduleDateSchema = z.union([DateStringSchema, RecurringDateSchema]);

const AmountRangeSchema = z.object({ num1: z.number(), num2: z.number() });
const AmountOpSchema = z.enum(['is', 'isapprox', 'isbetween']);

// `_date` is the legacy key some clients still send for `date`. Only rename
// it when `date` itself is absent, and never mutate the input object.
const withDateAlias = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value) && value.date === undefined && '_date' in value) {
    const { _date, ...rest } = value;
    return { ...rest, date: _date };
  }
  return value;
};

export const CreateScheduleSchema = z.object({
  schedule: z.preprocess(withDateAlias, z.object({
    name: z.string().min(1).max(255).optional(),
    // Required: if both `date` and `_date` are missing, withDateAlias is a
    // no-op and this required-field check is what rejects the payload.
    date: ScheduleDateSchema,
    amount: z.union([z.number(), AmountRangeSchema]).optional(),
    amountOp: AmountOpSchema.default('is'),
    account: z.string().optional(),
    payee: z.string().optional(),
    posts_transaction: z.boolean().optional(),
  })),
});

export const UpdateScheduleSchema = z.object({
  fields: z.preprocess(withDateAlias, z.object({
    name: z.string().min(1).max(255).optional(),
    date: ScheduleDateSchema.optional(),
    amount: z.union([z.number(), AmountRangeSchema]).optional(),
    amountOp: AmountOpSchema.optional(),
    account: z.string().optional(),
    payee: z.string().optional(),
    posts_transaction: z.boolean().optional(),
  }).refine((obj) => Object.keys(obj).length > 0, { message: 'At least one field must be updated' })),
});

const booleanFromQueryString = (value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export const ScheduleUpdateQuerySchema = z.object({
  resetNextDate: z.preprocess(booleanFromQueryString, z.boolean()).optional(),
});
