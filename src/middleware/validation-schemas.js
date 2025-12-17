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

// Query schema
export const QuerySchema = z.object({
  query: z.object({
    table: z.string().min(1),
    filter: z.any().optional(),
    select: z.any().optional(),
  }),
});

// Auth schemas
export const LoginSchema = z.object({
  username: z.string().min(1).max(255).optional(),
  password: z.string().min(1).optional(),
  refresh_token: z.string().optional(),
}).refine(
  (data) => (data.username && data.password) || data.refresh_token,
  'Either username+password or refresh_token required'
);

export const LogoutSchema = z.object({
  refresh_token: z.string().optional(),
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
