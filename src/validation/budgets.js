/**
 * Budget schemas.
 */
import { z } from 'zod';
import { MonthSchema, UuidSchema } from './common.js';

export const SetBudgetSchema = z.object({
  amount: z.number(),
});

export const BudgetMonthParamsSchema = z.object({
  month: MonthSchema,
});

export const BudgetCategoryParamsSchema = z.object({
  month: MonthSchema,
  categoryId: UuidSchema,
});

export const BudgetCarryoverSchema = z.object({
  flag: z.boolean(),
});

export const BudgetHoldSchema = z.object({
  amount: z.number(),
});

const SetAmountOperation = z.object({
  type: z.literal('setAmount'),
  month: MonthSchema,
  categoryId: UuidSchema,
  amount: z.number(),
});

const SetCarryoverOperation = z.object({
  type: z.literal('setCarryover'),
  month: MonthSchema,
  categoryId: UuidSchema,
  flag: z.boolean(),
});

export const BatchBudgetSchema = z.object({
  operations: z.array(
    z.discriminatedUnion('type', [SetAmountOperation, SetCarryoverOperation])
  ).min(1).max(500),
});

// `loadBudget(budgetId)` takes the local budget id from getBudgets(), which is
// not always a UUID (a locally-created file uses its own id), so this stays a
// non-empty string rather than UuidSchema.
export const LoadBudgetSchema = z.object({
  budgetId: z.string().min(1).max(255),
});
