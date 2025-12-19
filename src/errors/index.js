/**
 * Custom error classes for better error handling and categorization.
 *
 * These errors are automatically caught by the error handler middleware
 * and formatted with appropriate HTTP status codes.
 */

import { z } from 'zod';

/**
 * Base HTTP error class.
 * All custom errors extend this class.
 */
export class HttpError extends Error {
  constructor(message, status = 500, code = null, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      code: this.code,
      details: this.details,
    };
  }
}

/**
 * Validation error (400 Bad Request).
 * Used when request data fails validation.
 */
export class ValidationError extends HttpError {
  constructor(message, field = null, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.field = field;
  }
}

/**
 * Authentication error (401 Unauthorized).
 * Used when authentication fails or credentials are missing.
 */
export class AuthenticationError extends HttpError {
  constructor(message = 'Authentication required', details = null) {
    super(message, 401, 'AUTHENTICATION_ERROR', details);
  }
}

/**
 * Authorization error (403 Forbidden).
 * Used when user is authenticated but lacks permission.
 */
export class AuthorizationError extends HttpError {
  constructor(message = 'Insufficient permissions', details = null) {
    super(message, 403, 'AUTHORIZATION_ERROR', details);
  }
}

/**
 * Not found error (404 Not Found).
 * Used when a requested resource doesn't exist.
 */
export class NotFoundError extends HttpError {
  constructor(resource = 'Resource', details = null) {
    super(`${resource} not found`, 404, 'NOT_FOUND', details);
    this.resource = resource;
  }
}

/**
 * Conflict error (409 Conflict).
 * Used when a request conflicts with current state.
 */
export class ConflictError extends HttpError {
  constructor(message = 'Resource conflict', details = null) {
    super(message, 409, 'CONFLICT', details);
  }
}

/**
 * Rate limit error (429 Too Many Requests).
 * Used when rate limit is exceeded.
 */
export class RateLimitError extends HttpError {
  constructor(message = 'Too many requests', retryAfter = null, details = null) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', details);
    this.retryAfter = retryAfter;
  }
}

/**
 * Internal server error (500 Internal Server Error).
 * Used for unexpected server errors.
 */
export class InternalServerError extends HttpError {
  constructor(message = 'Internal server error', details = null) {
    super(message, 500, 'INTERNAL_ERROR', details);
  }
}

/**
 * Helper function to create errors from existing Error objects.
 */
export const createHttpError = (error, _defaultStatus = 500) => {
  if (error instanceof HttpError) {
    return error;
  }

  // Handle Zod errors specifically
  if (error instanceof z.ZodError) {
    const details = error.errors.map(e => ({ path: e.path.join('.'), message: e.message }));
    return new ValidationError('Validation failed', null, details);
  }

  // Handle errors with a 'status' property (e.g., from 'http-errors' or similar)
  if (error.status) {
    return new HttpError(error.message, error.status, null, error.details);
  }

  // Default to InternalServerError for unhandled errors
  return new InternalServerError(error.message || 'An unexpected error occurred', { originalError: error.name, stack: error.stack });
};

