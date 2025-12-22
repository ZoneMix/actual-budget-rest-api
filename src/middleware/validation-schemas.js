/**
 * Input validation schemas using Zod.
 * All API inputs should be validated against these schemas.
 */

import { z } from 'zod';

// Common ID schema - flexible for different ID formats
export const IDSchema = z.object({
  id: z.string().min(1).max(255),
});

// Account schemas
export const CreateAccountSchema = z.object({
  account: z.object({
    name: z.string().min(1).max(255),
    type: z.string().optional(),
    offBudget: z.boolean().optional(),
  }),
  initialBalance: z.number().optional(),
});

export const UpdateAccountSchema = z.object({
  fields: z.object({
    name: z.string().min(1).max(255).optional(),
    type: z.string().optional(),
    offBudget: z.boolean().optional(),
    closed: z.boolean().optional(),
  }).refine((obj) => Object.keys(obj).length > 0, {
    message: 'At least one field must be updated',
  }),
});

export const CloseAccountSchema = z.object({
  transferAccountId: z.string().optional(),
  transferCategoryId: z.string().optional(),
});

export const AccountBalanceQuerySchema = z.object({
  cutoff: z.string().datetime().optional(),
});

// Transaction schemas
export const CreateTransactionSchema = z.object({
  transaction: z.object({
    account: z.string().min(1),
    date: z.string().optional(),
    amount: z.number(),
    payee: z.string().max(255).optional(),
    notes: z.string().max(1000).optional(),
    category: z.string().optional(),
  }),
});

export const UpdateTransactionSchema = z.object({
  fields: z.object({
    amount: z.number().optional(),
    payee: z.string().max(255).optional(),
    category: z.string().optional(),
    notes: z.string().max(1000).optional(),
    date: z.string().optional(),
    cleared: z.boolean().optional(),
  }).refine((obj) => Object.keys(obj).length > 0, {
    message: 'At least one field must be updated',
  }),
});

// Category schemas
export const CreateCategorySchema = z.object({
  category: z.object({
    name: z.string().min(1).max(255),
    group_id: z.string().optional(),
  }),
});

export const UpdateCategorySchema = z.object({
  fields: z.object({
    name: z.string().min(1).max(255).optional(),
    group_id: z.string().optional(),
    hidden: z.boolean().optional(),
  }).refine((obj) => Object.keys(obj).length > 0, {
    message: 'At least one field must be updated',
  }),
});

// Category Group schemas
export const CreateCategoryGroupSchema = z.object({
  group: z.object({
    name: z.string().min(1).max(255),
    is_income: z.boolean().optional(),
  }),
});

export const UpdateCategoryGroupSchema = z.object({
  fields: z.object({
    name: z.string().min(1).max(255).optional(),
    is_income: z.boolean().optional(),
    hidden: z.boolean().optional(),
  }).refine((obj) => Object.keys(obj).length > 0, {
    message: 'At least one field must be updated',
  }),
});

// Payee schemas
export const CreatePayeeSchema = z.object({
  payee: z.object({
    name: z.string().min(1).max(255),
  }),
});

export const UpdatePayeeSchema = z.object({
  fields: z.object({
    name: z.string().min(1).max(255).optional(),
  }).refine((obj) => Object.keys(obj).length > 0, {
    message: 'At least one field must be updated',
  }),
});

// Budget schemas
export const SetBudgetSchema = z.object({
  amount: z.number(),
});

// Rule schemas
export const CreateRuleSchema = z.object({
  rule: z.object({
    stage: z.string().optional(),
    conditions: z.array(z.any()),
    actions: z.array(z.any()),
  }),
});

export const UpdateRuleSchema = z.object({
  fields: z.object({
    stage: z.string().optional(),
    conditions: z.array(z.any()).optional(),
    actions: z.array(z.any()).optional(),
  }).refine((obj) => Object.keys(obj).length > 0, {
    message: 'At least one field must be updated',
  }),
});

// Schedule schemas
export const CreateScheduleSchema = z.object({
  schedule: z.object({
    name: z.string().min(1).max(255),
    posts_transaction: z.boolean().optional(),
    _date: z.any(),
  }),
});

export const UpdateScheduleSchema = z.object({
  fields: z.object({
    name: z.string().min(1).max(255).optional(),
    posts_transaction: z.boolean().optional(),
    _date: z.any().optional(),
  }).refine((obj) => Object.keys(obj).length > 0, {
    message: 'At least one field must be updated',
  }),
});

// ActualQL Query schema with security restrictions
// Based on: https://actualbudget.org/docs/api/actual-ql/
export const QuerySchema = z.object({
  query: z.object({
    // Only allow read-only tables (whitelist)
    table: z.enum([
      'transactions',
      'accounts',
      'categories',
      'category_groups',
      'payees',
      'schedules',
      'rules',
      'budgets',
      'budget_months',
    ], {
      errorMap: () => ({ message: 'Invalid table name. Allowed tables: transactions, accounts, categories, category_groups, payees, schedules, rules, budgets, budget_months' }),
    }),
    // Filter conditions with validation
    filter: z.record(z.any()).optional(),
    // Select fields (array of strings or '*')
    select: z.union([
      z.literal('*'),
      z.array(z.string()),
      z.string(),
    ]).optional(),
    // Options (only allow safe options)
    options: z.object({
      splits: z.enum(['inline', 'grouped', 'all']).optional(),
    }).optional(),
  }),
});

// Auth schemas
export const LoginSchema = z.object({
  username: z.string()
    .min(1)
    .max(255)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens')
    .optional(),
  password: z.string().min(1).optional(),
  refresh_token: z.string().optional(),
}).refine(
  (data) => (data.username && data.password) || data.refresh_token,
  'Either username+password or refresh_token required'
);

export const LogoutSchema = z.object({
  refresh_token: z.string().optional(),
});

// Payee merge schema
export const MergePayeesSchema = z.object({
  targetId: z.string().uuid(),
  mergeIds: z.array(z.string().uuid()).min(1),
});

// Budget schemas
export const BudgetMonthParamsSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

export const BudgetCategoryParamsSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  categoryId: z.string().uuid(),
});

export const BudgetCarryoverSchema = z.object({
  flag: z.boolean(),
});

export const BudgetHoldSchema = z.object({
  amount: z.number(),
});

// Transaction schemas
export const AccountIdParamsSchema = z.object({
  accountId: z.string().uuid(),
});

export const TransactionsAddSchema = z.object({
  transactions: z.array(CreateTransactionSchema),
  runTransfers: z.boolean().optional().default(false),
  learnCategories: z.boolean().optional().default(false),
});

export const TransactionsImportSchema = z.object({
  transactions: z.array(CreateTransactionSchema),
});

// Rules schemas
export const PayeeIdParamsSchema = z.object({
  payeeId: z.string().uuid(),
});

// Admin OAuth client schemas
export const CreateClientSchema = z.object({
  client_id: z.string().min(1).max(255),
  client_secret: z.string().min(32).optional(),
  allowed_scopes: z.string().default('api'),
  redirect_uris: z.union([
    z.string(),
    z.array(z.string().url()),
  ]).optional().default(''),
});

export const UpdateClientSchema = z.object({
  client_secret: z.string().min(32).optional(),
  allowed_scopes: z.string().optional(),
  redirect_uris: z.union([
    z.string(),
    z.array(z.string().url()),
  ]).optional(),
}).refine((obj) => Object.keys(obj).length > 0, {
  message: 'At least one field must be updated',
});

export const ClientIdParamsSchema = z.object({
  clientId: z.string().min(1).max(255),
});

// Validation middleware factory
export const validateBody = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      error: 'Validation failed',
      details: result.error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      })),
    });
  }
  req.validatedBody = result.data;
  next();
};

export const validateParams = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.params);
  if (!result.success) {
    return res.status(400).json({
      error: 'Invalid parameters',
      details: result.error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      })),
    });
  }
  req.validatedParams = result.data;
  next();
};

export const validateQuery = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    return res.status(400).json({
      error: 'Invalid query parameters',
      details: result.error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      })),
    });
  }
  req.validatedQuery = result.data;
  next();
};
