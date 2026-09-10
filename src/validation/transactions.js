/**
 * Transaction schemas.
 */
import { z } from 'zod';
import { PAYEE_NAME_NORMALIZATIONS } from './constants.js';

const DateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

const SubtransactionSchema = z.object({
  amount: z.number(),
  category: z.string().nullable().optional(),
  notes: z.string().optional(),
  payee: z.string().optional(),
});

// `amountSchema` lets Create/Update share every other field while differing
// only on whether `amount` itself is required (create) or optional (update).
const transactionFields = (amountSchema) => ({
  amount: amountSchema,
  date: DateStringSchema.optional(),
  payee: z.string().optional(),
  payee_name: z.string().optional(),
  imported_payee: z.string().optional(),
  imported_id: z.string().optional(),
  notes: z.string().max(1000).optional(),
  category: z.string().nullable().optional(),
  cleared: z.boolean().optional(),
  reconciled: z.boolean().optional(),
  transfer_id: z.string().nullable().optional(),
  starting_balance_flag: z.boolean().optional(),
  subtransactions: z.array(SubtransactionSchema).optional(),
});

// Used for transactions nested under /accounts/:accountId/transactions —
// no `account` field, since the account is already in the URL.
export const AccountTransactionSchema = z.object(transactionFields(z.number()));

export const CreateTransactionSchema = z.object({
  transaction: z.object({
    account: z.string().min(1),
    ...transactionFields(z.number()),
  }),
});

export const UpdateTransactionSchema = z.object({
  fields: z.object(transactionFields(z.number().optional()))
    .refine((obj) => Object.keys(obj).length > 0, { message: 'At least one field must be updated' }),
});

export const TransactionsAddSchema = z.object({
  transactions: z.array(AccountTransactionSchema).min(1),
  runTransfers: z.boolean().default(false),
  learnCategories: z.boolean().default(false),
});

export const ImportOptsSchema = z.object({
  defaultCleared: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  reimportDeleted: z.boolean().optional(),
  payeeNameNormalization: z.enum(PAYEE_NAME_NORMALIZATIONS).optional(),
});

export const TransactionsImportSchema = z.object({
  transactions: z.array(AccountTransactionSchema).min(1),
  opts: ImportOptsSchema.optional(),
});
