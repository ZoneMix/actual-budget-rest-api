/**
 * Schedule schemas.
 */
import { z } from 'zod';
import { atLeastOneKey, DateStringSchema, BooleanQuerySchema } from './common.js';
import { SCHEDULE_FREQUENCIES, SCHEDULE_WEEKEND_SOLVE_MODES, SCHEDULE_AMOUNT_OPS } from './constants.js';

const RecurringDateSchema = z.object({
  start: z.string(),
  frequency: z.enum(SCHEDULE_FREQUENCIES),
  interval: z.number().int().min(1).optional(),
  patterns: z.array(z.unknown()).optional(),
  skipWeekend: z.boolean().optional(),
  weekendSolveMode: z.enum(SCHEDULE_WEEKEND_SOLVE_MODES).optional(),
  endMode: z.string().optional(),
  endOccurrences: z.number().int().optional(),
  endDate: z.string().optional(),
});

export const ScheduleDateSchema = z.union([DateStringSchema, RecurringDateSchema]);

const AmountRangeSchema = z.object({ num1: z.number(), num2: z.number() });
const AmountOpSchema = z.enum(SCHEDULE_AMOUNT_OPS);

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
  fields: z.preprocess(withDateAlias, atLeastOneKey(z.object({
    name: z.string().min(1).max(255).optional(),
    date: ScheduleDateSchema.optional(),
    amount: z.union([z.number(), AmountRangeSchema]).optional(),
    amountOp: AmountOpSchema.optional(),
    account: z.string().optional(),
    payee: z.string().optional(),
    posts_transaction: z.boolean().optional(),
  }))),
});

export const ScheduleUpdateQuerySchema = z.object({
  resetNextDate: BooleanQuerySchema.optional(),
});
