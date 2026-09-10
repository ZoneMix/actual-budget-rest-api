/**
 * Custom error classes for better error handling and categorization.
 *
 * These errors are automatically caught by the error handler middleware
 * and formatted with appropriate HTTP status codes.
 */

import { z } from 'zod';
import { formatZodError } from '../validation/errors.js';

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
 * Engine rejection (400 Bad Request).
 *
 * The Actual engine validates its own arguments and rejects a bad call by
 * throwing `APIError(msg, meta)` — closing a funded account with no
 * `transferAccountId`, an ActualQL `calculate` naming something that is not a
 * column, a month with no budget. Those are client mistakes the wrapper's Zod
 * layer cannot catch, because only the engine knows the ledger's contents.
 *
 * Distinct from ValidationError so the two are not confused in logs or by
 * callers: VALIDATION_ERROR means the request never reached the engine,
 * ENGINE_ERROR means it did and the engine refused it.
 */
export class EngineError extends HttpError {
  constructor(message = 'The budget engine rejected the request', details = null) {
    super(message, 400, 'ENGINE_ERROR', details);
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
 * Service unavailable error (503 Service Unavailable).
 * Used when a downstream resource is saturated and the request cannot be
 * queued — e.g. the Actual engine queue is at its configured depth cap.
 */
export class ServiceUnavailableError extends HttpError {
  constructor(message = 'Service unavailable', details = null) {
    super(message, 503, 'SERVICE_UNAVAILABLE', details);
  }
}

/**
 * Bad gateway error (502 Bad Gateway).
 * Used when the embedded engine reached the upstream Actual server and got an
 * unusable answer back — e.g. `getServerVersion()` resolving to
 * `{ error: 'no-server' }` or `{ error: 'network-failure' }`. The wrapper and
 * the request are both fine; the dependency is not, so this is neither a 4xx
 * nor a plain 500.
 */
export class BadGatewayError extends HttpError {
  constructor(message = 'Upstream server error', details = null) {
    super(message, 502, 'BAD_GATEWAY', details);
  }
}

/**
 * Gateway timeout error (504 Gateway Timeout).
 * Used when an upstream/embedded call exceeds its allotted time budget.
 */
export class GatewayTimeoutError extends HttpError {
  constructor(message = 'Upstream operation timed out', details = null) {
    super(message, 504, 'GATEWAY_TIMEOUT', details);
  }
}

/**
 * The engine's "no such row" rejection.
 *
 * `api/get-id-by-name` throws APIError("Not found: <type> with name <name>")
 * (@actual-app/api/dist/index.js:112711). Anchored to the start of the message
 * so an unrelated message that merely contains the words is not caught.
 *
 * @param {object} error - a candidate engine rejection
 */
export const isEngineNotFound = (error) =>
  error?.type === 'APIError'
  && typeof error.message === 'string'
  && error.message.startsWith('Not found');

/**
 * The message `checkFileOpen()` throws when the process has no ledger loaded
 * (@actual-app/api/dist/index.js:112062).
 */
const NO_BUDGET_OPEN = 'No budget file is open';

/**
 * Maps an engine APIError onto the status its message actually means.
 *
 * Most of them are the caller's mistake and a 400, but two are not: a missing
 * row is a 404, and a process with no budget file open is a 503 — nothing the
 * caller can rephrase will fix it, so it belongs with the other "the engine
 * cannot serve you right now" answers.
 */
const fromApiError = (error) => {
  const message = typeof error.message === 'string' ? error.message : '';

  if (isEngineNotFound(error)) {
    // Trim the engine's "Not found: " prefix — NotFoundError appends
    // " not found" itself, and both would read as a stutter. The only such
    // message the SDK produces is `Not found: ${type} with name ${name}`, so
    // the remainder always names the thing; fall back to the whole message if
    // a future one has nothing after the prefix.
    const resource = message.replace(/^Not found:\s*/, '').trim();
    return new NotFoundError(resource || message, error.meta ?? null);
  }

  if (message.startsWith(NO_BUDGET_OPEN)) {
    return new ServiceUnavailableError(message, error.meta ?? null);
  }

  return new EngineError(message || undefined, error.meta ?? null);
};

/**
 * Helper function to create errors from existing Error objects.
 */
export const createHttpError = (error, _defaultStatus = 500) => {
  if (error instanceof HttpError) {
    return error;
  }

  // Handle Zod errors specifically. Zod 4 renamed ZodError#errors to
  // ZodError#issues — formatZodError reads the right property.
  if (error instanceof z.ZodError) {
    return new ValidationError('Validation failed', null, formatZodError(error));
  }

  // The engine's own rejection. APIError(msg, meta) returns a plain OBJECT, not
  // an Error subclass, and runHandler re-throws it untouched — so it has no
  // `instanceof Error`, no `status` and no `stack`, and every check below would
  // miss it. Left unmapped it became a 500 for what is usually a 400.
  if (error?.type === 'APIError') {
    return fromApiError(error);
  }

  // Handle errors with a 'status' property (e.g., from 'http-errors' or similar)
  if (error.status) {
    return new HttpError(error.message, error.status, null, error.details);
  }

  // Default to InternalServerError for unhandled errors
  return new InternalServerError(error.message || 'An unexpected error occurred', { originalError: error.name, stack: error.stack });
};

