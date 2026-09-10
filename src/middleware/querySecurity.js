/**
 * Security middleware for ActualQL query endpoint.
 *
 * Validates and restricts queries to prevent:
 * - Access to unauthorized tables
 * - Dangerous operations
 * - Resource exhaustion attacks
 *
 * Based on ActualQL documentation: https://actualbudget.org/docs/api/actual-ql/
 */

import logger from '../logging/logger.js';
import { ValidationError } from '../errors/index.js';
import { ACTUAL_QUERY_MAX_RESULTS, ACTUAL_QUERY_MAX_FILTER_DEPTH } from '../config/index.js';

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
 * Query limits. Both come from the validated environment
 * (ACTUAL_QUERY_MAX_RESULTS / ACTUAL_QUERY_MAX_FILTER_DEPTH) so an operator
 * can tune them without editing code.
 */
const MAX_RESULTS = ACTUAL_QUERY_MAX_RESULTS;
const MAX_FILTER_DEPTH = ACTUAL_QUERY_MAX_FILTER_DEPTH;

/**
 * Substrings that must never appear in a field name reaching the engine.
 */
const UNSAFE_FIELD_SUBSTRINGS = ['..', '/', '\\'];

/**
 * Rejects a single field name containing a path-traversal sequence.
 */
const assertSafeFieldName = (name, label) => {
  if (UNSAFE_FIELD_SUBSTRINGS.some((unsafe) => name.includes(unsafe))) {
    throw new ValidationError(`Invalid ${label} field name: ${name}`);
  }
};

/**
 * Applies the field-name check to a whole expression.
 *
 * orderBy / groupBy / calculate each accept a string, an array, or an object
 * form such as `{ $sum: 'amount' }` or `{ date: 'desc' }`, so both the keys and
 * the values of object forms are field names and both are checked. Non-string
 * leaves (booleans, numbers, null) carry no field name and are ignored.
 */
const validateFieldExpression = (value, label, depth = 0) => {
  if (depth > MAX_FILTER_DEPTH) {
    throw new ValidationError(`${label} exceeds maximum allowed depth`);
  }

  if (typeof value === 'string') {
    assertSafeFieldName(value, label);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => validateFieldExpression(entry, label, depth + 1));
    return;
  }

  if (value !== null && typeof value === 'object') {
    Object.entries(value).forEach(([key, nested]) => {
      assertSafeFieldName(key, label);
      validateFieldExpression(nested, label, depth + 1);
    });
  }
};

/**
 * Validates filter object structure and depth.
 */
const validateFilter = (filter, depth = 0) => {
  if (depth > MAX_FILTER_DEPTH) {
    throw new ValidationError('Filter depth exceeds maximum allowed depth');
  }

  if (typeof filter !== 'object' || filter === null || Array.isArray(filter)) {
    throw new ValidationError('Invalid filter structure');
  }

  // Check for dangerous operators
  const dangerousOperators = ['$exec', '$eval', '$function'];
  for (const key of Object.keys(filter)) {
    if (dangerousOperators.includes(key.toLowerCase())) {
      throw new ValidationError(`Dangerous operator '${key}' is not allowed`);
    }

    // Recursively validate nested filters ($and, $or)
    if (key === '$and' || key === '$or') {
      // Safe: key is validated to be '$and' or '$or' before access
      // eslint-disable-next-line security/detect-object-injection
      if (!Array.isArray(filter[key])) {
        throw new ValidationError(`'${key}' must be an array`);
      }
      // eslint-disable-next-line security/detect-object-injection
      if (filter[key].length > 50) {
        throw new ValidationError(`'${key}' array exceeds maximum length of 50`);
      }
      // eslint-disable-next-line security/detect-object-injection
      filter[key].forEach((item) => validateFilter(item, depth + 1));
    }
  }
};

/**
 * Validates select fields.
 */
const validateSelect = (select) => {
  if (select === '*') return;
  
  if (Array.isArray(select)) {
    if (select.length > 100) {
      throw new ValidationError('Select array exceeds maximum length of 100 fields');
    }
    select.forEach((field) => {
      if (typeof field !== 'string') {
        throw new ValidationError('Select fields must be strings');
      }
      // Prevent path traversal in field names
      assertSafeFieldName(field, 'select');
    });
  } else if (typeof select === 'string') {
    if (select !== '*') {
      throw new ValidationError('Select must be "*" or an array of field names');
    }
  } else {
    throw new ValidationError('Select must be "*" or an array of strings');
  }
};

/**
 * Validates and sanitizes an ActualQL query.
 * Throws ValidationError if query is invalid or dangerous.
 */
export const validateQuery = (queryObj) => {
  const { table, filter, select, options, orderBy, groupBy, calculate } = queryObj;

  // Validate table name
  if (!ALLOWED_TABLES.has(table)) {
    throw new ValidationError(
      `Table '${table}' is not allowed. Allowed tables: ${Array.from(ALLOWED_TABLES).join(', ')}`
    );
  }

  // Validate filter if provided
  if (filter !== undefined && filter !== null) {
    validateFilter(filter);
  }

  // Validate select if provided
  if (select !== undefined) {
    validateSelect(select);
  }

  // orderBy / groupBy / calculate are field expressions too, and reach the
  // engine on the same path select does.
  if (orderBy !== undefined) validateFieldExpression(orderBy, 'orderBy');
  if (groupBy !== undefined) validateFieldExpression(groupBy, 'groupBy');
  if (calculate !== undefined) validateFieldExpression(calculate, 'calculate');

  // Validate options
  if (options) {
    if (typeof options !== 'object' || Array.isArray(options)) {
      throw new ValidationError('Options must be an object');
    }
    
    // Only allow safe options
    const allowedOptions = ['splits'];
    for (const key of Object.keys(options)) {
      if (!allowedOptions.includes(key)) {
        throw new ValidationError(`Option '${key}' is not allowed`);
      }
    }
  }

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
  if (Array.isArray(results)) {
    if (results.length > MAX_RESULTS) {
      logger.warn('Query result truncated', {
        originalLength: results.length,
        maxResults: MAX_RESULTS,
      });
      return results.slice(0, MAX_RESULTS);
    }
  }
  return results;
};

