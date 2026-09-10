/**
 * Validation middleware factories + a barrel export of every domain schema
 * file. Routes keep importing from src/middleware/validation-schemas.js,
 * which re-exports everything from here.
 */
import { ValidationError } from '../errors/index.js';
import { formatZodError } from './errors.js';

export * from './errors.js';
export * from './constants.js';
export * from './common.js';
export * from './accounts.js';
export * from './transactions.js';
export * from './categories.js';
export * from './categoryGroups.js';
export * from './payees.js';
export * from './budgets.js';
export * from './rules.js';
export * from './schedules.js';
export * from './tags.js';
export * from './notes.js';
export * from './accountGroups.js';
export * from './query.js';
export * from './auth.js';
export * from './admin.js';

const parseOrThrow = (schema, data) => {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError('Validation failed', null, formatZodError(result.error));
  }
  return result.data;
};

export const validateBody = (schema) => (req, _res, next) => {
  req.validatedBody = parseOrThrow(schema, req.body);
  next();
};

export const validateParams = (schema) => (req, _res, next) => {
  req.validatedParams = parseOrThrow(schema, req.params);
  next();
};

export const validateQuery = (schema) => (req, _res, next) => {
  req.validatedQuery = parseOrThrow(schema, req.query);
  next();
};
