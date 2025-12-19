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

import { httpError } from './errorHandler.js';

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
 * Throw an HTTP error that will be caught by the error handler middleware.
 * Errors thrown this way are automatically logged and formatted consistently.
 *
 * @param {number} status - HTTP status code
 * @param {string} message - Error message
 * @throws {Error} HTTP error with status code
 */
export const throwError = (status, message) => {
  throw httpError(status, message);
};

/**
 * Common HTTP error throwers for convenience.
 * These throw errors that are caught by the error handler middleware.
 */
export const throwBadRequest = (message = 'Bad request') => throwError(400, message);
export const throwUnauthorized = (message = 'Unauthorized') => throwError(401, message);
export const throwForbidden = (message = 'Forbidden') => throwError(403, message);
export const throwNotFound = (message = 'Not found') => throwError(404, message);
export const throwConflict = (message = 'Conflict') => throwError(409, message);
export const throwInternalError = (message = 'Internal server error') => throwError(500, message);

