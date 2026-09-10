/**
 * Normalises any thrown value into one of the HTTP error classes.
 *
 * The classes themselves live in ./httpErrors.js and are re-exported here, so
 * `import { NotFoundError } from '../errors/index.js'` keeps working.
 *
 * These errors are automatically caught by the error handler middleware and
 * formatted with appropriate HTTP status codes.
 */

import { z } from 'zod';
import { formatZodError } from '../validation/errors.js';
import {
  HttpError,
  ValidationError,
  EngineError,
  NotFoundError,
  InternalServerError,
  ServiceUnavailableError,
} from './httpErrors.js';

export * from './httpErrors.js';

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

