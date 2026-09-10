/**
 * Security middleware for ActualQL query endpoint.
 *
 * Validates and restricts queries to prevent:
 * - Access to unauthorized tables
 * - Dangerous operations
 * - Resource exhaustion attacks
 *
 * The structural checks for filters and field expressions live in
 * queryExpressions.js; this file owns the table allow-list, the audit log and
 * the result cap.
 *
 * Based on ActualQL documentation: https://actualbudget.org/docs/api/actual-ql/
 */

import logger from '../logging/logger.js';
import { ValidationError } from '../errors/index.js';
import { ACTUAL_QUERY_MAX_RESULTS } from '../config/index.js';
import { validateFilter, validateSelect, validateFieldExpression } from './queryExpressions.js';

/**
 * Allowed table names for queries.
 * Only read-only tables are permitted.
 */
const ALLOWED_TABLES = new Set([
  'transactions',
  'accounts',
  'categories',
  'category_groups',
  'payees',
  'schedules',
  'rules',
  'budgets',
  'budget_months',
]);

/**
 * Options the query builder may receive. Anything else is rejected rather than
 * forwarded, since `options` goes straight to the engine's table handling.
 */
const ALLOWED_OPTIONS = ['splits'];

/**
 * Maximum number of rows returned before truncation. Comes from the validated
 * environment (ACTUAL_QUERY_MAX_RESULTS) so an operator can tune it.
 */
const MAX_RESULTS = ACTUAL_QUERY_MAX_RESULTS;

/**
 * Validates the `options` object.
 */
const validateOptions = (options) => {
  if (typeof options !== 'object' || Array.isArray(options)) {
    throw new ValidationError('Options must be an object');
  }
  for (const key of Object.keys(options)) {
    if (!ALLOWED_OPTIONS.includes(key)) {
      throw new ValidationError(`Option '${key}' is not allowed`);
    }
  }
};

/**
 * Validates and sanitizes an ActualQL query.
 * Throws ValidationError if query is invalid or dangerous.
 */
export const validateQuery = (queryObj) => {
  const { table, filter, select, options, orderBy, groupBy, calculate } = queryObj;

  if (!ALLOWED_TABLES.has(table)) {
    throw new ValidationError(
      `Table '${table}' is not allowed. Allowed tables: ${Array.from(ALLOWED_TABLES).join(', ')}`
    );
  }

  if (filter !== undefined && filter !== null) validateFilter(filter);
  if (select !== undefined) validateSelect(select);

  // orderBy / groupBy / calculate are field expressions too, and reach the
  // engine on the same path select does.
  if (orderBy !== undefined) validateFieldExpression(orderBy, 'orderBy');
  if (groupBy !== undefined) validateFieldExpression(groupBy, 'groupBy');
  if (calculate !== undefined) validateFieldExpression(calculate, 'calculate');

  if (options) validateOptions(options);

  return true;
};

/**
 * Middleware to validate and secure ActualQL queries.
 * Logs all queries for audit purposes.
 */
export const secureQueryMiddleware = (req, res, next) => {
  try {
    const { query } = req.validatedBody;

    // Validate query structure
    validateQuery(query);

    // Log query for audit trail (sanitized - don't log full filter data)
    logger.info('ActualQL query executed', {
      requestId: req.id,
      userId: req.user?.user_id,
      table: query.table,
      hasFilter: !!query.filter,
      filterKeys: query.filter ? Object.keys(query.filter) : [],
      hasSelect: !!query.select,
      selectType: Array.isArray(query.select) ? 'array' : typeof query.select,
      selectCount: Array.isArray(query.select) ? query.select.length : null,
      options: query.options,
    });

    next();
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError('Invalid query structure', null, { originalError: error.message });
  }
};

/**
 * Limits query results to prevent resource exhaustion.
 */
export const limitQueryResults = (results) => {
  if (Array.isArray(results) && results.length > MAX_RESULTS) {
    logger.warn('Query result truncated', {
      originalLength: results.length,
      maxResults: MAX_RESULTS,
    });
    return results.slice(0, MAX_RESULTS);
  }
  return results;
};
