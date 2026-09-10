/**
 * Account schemas — shaped after APIAccountEntity
 * (node_modules/@actual-app/core/@types/src/server/api-models.d.ts:4-9).
 * There is no `type` field on a real Actual account; the pre-Phase-E schema
 * accepted one but it was silently dropped (never forwarded to the SDK).
 */
import { z } from 'zod';

// `offBudget` (camelCase) is a legacy alias some clients still send; the
// SDK field is `offbudget`. Returns a NEW object (never mutates the parsed
// input) with the alias folded in and removed.
const withOffbudgetAlias = (shape) => z.object(shape).transform(({ offBudget, ...rest }) => (
  offBudget === undefined ? rest : { ...rest, offbudget: offBudget }
));

const baseFields = {
  name: z.string().min(1).max(255),
  offbudget: z.boolean().optional(),
  offBudget: z.boolean().optional(),
  closed: z.boolean().optional(),
  account_group_id: z.string().nullable().optional(),
};

const updateFields = {
  ...baseFields,
  name: z.string().min(1).max(255).optional(),
};

export const CreateAccountSchema = z.object({
  account: withOffbudgetAlias(baseFields),
  initialBalance: z.number().optional(),
});

export const UpdateAccountSchema = z.object({
  fields: withOffbudgetAlias(updateFields).refine(
    (obj) => Object.keys(obj).length > 0,
    { message: 'At least one field must be updated' }
  ),
});

export const CloseAccountSchema = z.object({
  transferAccountId: z.string().optional(),
  transferCategoryId: z.string().optional(),
});

export const AccountBalanceQuerySchema = z.object({
  cutoff: z.iso.datetime().optional(),
});
