/**
 * Response helper utilities for consistent API responses.
 *
 * Use these helpers instead of directly calling res.status().json() to ensure:
 * - Consistent response format across all endpoints
 * - Automatic error logging through the error handler middleware
 * - Request ID tracking in error responses
 *
 * @example
 * // Instead of: res.json({ success: true, accounts })
 * sendSuccess(res, { accounts });
 *
 * // Instead of: res.status(400).json({ error: 'Invalid input' })
 * throwBadRequest('Invalid input');
 */

import {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  InternalServerError,
} from '../errors/index.js';

/**
 * Send a success response (200 OK).
 *
 * @param {object} res - Express response object
 * @param {object|array|null} data - Data to include in response (object/array merged, primitives as 'data' field)
 * @param {string|null} message - Optional success message
 * @returns {object} Express response
 */
export const sendSuccess = (res, data = null, message = null) => {
  const response = { success: true };
  if (data !== null) {
    if (Array.isArray(data) || typeof data === 'object') {
      Object.assign(response, data);
    } else {
      response.data = data;
    }
  }
  if (message) response.message = message;
  return res.json(response);
};

/**
 * Send a created response (201 Created).
 *
 * @param {object} res - Express response object
 * @param {object|string|null} data - Created resource data (object merged, primitives as 'id' field)
 * @returns {object} Express response
 */
export const sendCreated = (res, data = null) => {
  const response = { success: true };
  if (data !== null) {
    if (typeof data === 'object' && !Array.isArray(data)) {
      Object.assign(response, data);
    } else {
      response.id = data;
    }
  }
  return res.status(201).json(response);
};

/**
 * Common HTTP error throwers for convenience.
 * These throw errors that are caught by the error handler middleware.
 */
export const throwBadRequest = (message = 'Bad request', field = null, details = null) => {
  throw new ValidationError(message, field, details);
};
export const throwUnauthorized = (message = 'Unauthorized', details = null) => {
  throw new AuthenticationError(message, details);
};
export const throwForbidden = (message = 'Forbidden', details = null) => {
  throw new AuthorizationError(message, details);
};
export const throwNotFound = (message = 'Resource not found', details = null) => {
  throw new NotFoundError(message, details);
};
export const throwInternalError = (message = 'Internal server error', details = null) => {
  throw new InternalServerError(message, details);
};

