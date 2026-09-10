/**
 * Structural checks for the pieces of an ActualQL query: filters, and the
 * field expressions behind select / orderBy / groupBy / calculate.
 *
 * Split out of querySecurity.js, which keeps the table allow-list, the
 * middleware and the result cap. Everything here is a pure function that
 * throws ValidationError; nothing touches the request.
 *
 * @see https://actualbudget.org/docs/api/actual-ql/
 */

import { ValidationError } from '../errors/index.js';
import { ACTUAL_QUERY_MAX_FILTER_DEPTH } from '../config/index.js';

// Operators that would let a filter smuggle code past the engine's own parser.
const DANGEROUS_OPERATORS = ['$exec', '$eval', '$function'];

// Substrings that must never appear in a field name reaching the engine.
const UNSAFE_FIELD_SUBSTRINGS = ['..', '/', '\\'];

const MAX_CONDITION_ARRAY_LENGTH = 50;
const MAX_SELECT_FIELDS = 100;

/**
 * Rejects a single field name containing a path-traversal sequence.
 */
export const assertSafeFieldName = (name, label) => {
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
export const validateFieldExpression = (value, label, depth = 0) => {
  if (depth > ACTUAL_QUERY_MAX_FILTER_DEPTH) {
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
 * Validates one $and/$or branch: it must be a bounded array, and every entry
 * is itself a filter one level deeper.
 */
const validateConditionGroup = (group, key, depth) => {
  if (!Array.isArray(group)) {
    throw new ValidationError(`'${key}' must be an array`);
  }
  if (group.length > MAX_CONDITION_ARRAY_LENGTH) {
    throw new ValidationError(`'${key}' array exceeds maximum length of ${MAX_CONDITION_ARRAY_LENGTH}`);
  }
  // eslint-disable-next-line no-use-before-define
  group.forEach((item) => validateFilter(item, depth + 1));
};

/**
 * Validates filter object structure and depth.
 */
export const validateFilter = (filter, depth = 0) => {
  if (depth > ACTUAL_QUERY_MAX_FILTER_DEPTH) {
    throw new ValidationError('Filter depth exceeds maximum allowed depth');
  }

  if (typeof filter !== 'object' || filter === null || Array.isArray(filter)) {
    throw new ValidationError('Invalid filter structure');
  }

  for (const key of Object.keys(filter)) {
    if (DANGEROUS_OPERATORS.includes(key.toLowerCase())) {
      throw new ValidationError(`Dangerous operator '${key}' is not allowed`);
    }

    if (key === '$and' || key === '$or') {
      // Safe: key is validated to be '$and' or '$or' before access
      // eslint-disable-next-line security/detect-object-injection
      validateConditionGroup(filter[key], key, depth);
    }
  }
};

/**
 * Validates select fields: either the literal '*' or a bounded array of names.
 */
export const validateSelect = (select) => {
  if (select === '*') return;

  if (Array.isArray(select)) {
    if (select.length > MAX_SELECT_FIELDS) {
      throw new ValidationError(`Select array exceeds maximum length of ${MAX_SELECT_FIELDS} fields`);
    }
    select.forEach((field) => {
      if (typeof field !== 'string') {
        throw new ValidationError('Select fields must be strings');
      }
      assertSafeFieldName(field, 'select');
    });
    return;
  }

  if (typeof select === 'string') {
    throw new ValidationError('Select must be "*" or an array of field names');
  }

  throw new ValidationError('Select must be "*" or an array of strings');
};
