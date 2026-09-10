/**
 * HTTP error classes.
 *
 * One class per status the API answers with. They are caught by the error
 * handler middleware (src/middleware/errorHandler.js), which reads `status`,
 * `code` and `details` off them — nothing here decides what to log or render.
 *
 * `createHttpError` in ./index.js is what turns a foreign error into one of
 * these; it lives there so this file stays a plain catalogue.
 */

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
