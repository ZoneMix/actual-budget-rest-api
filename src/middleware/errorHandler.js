/**
 * Shared error utilities and global Express error handler.
 *
 * This middleware catches all errors thrown in route handlers and provides:
 * - Consistent error response format
 * - Automatic error logging with request context
 * - Security: hides internal error details in production
 * - Request ID tracking for debugging
 */
import logger from '../logging/logger.js';
import { createHttpError } from '../errors/index.js';

/**
 * Global error handler middleware.
 * Catches all errors from route handlers and formats consistent responses.
 *
 * @param {Error} err - Error object (may have err.status property)
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} _next - Express next function (unused)
 */
export const errorHandler = (err, req, res, _next) => {
  // Normalize error to HttpError
  const httpErr = createHttpError(err);
  const status = httpErr.status;
  const requestId = req.id;
  const isProd = process.env.NODE_ENV === 'production';

  // Build comprehensive error log with request context
  const errorLog = {
    requestId,
    method: req.method,
    url: req.originalUrl,
    status,
    errorName: httpErr.name,
    errorCode: httpErr.code,
    message: httpErr.message,
    stack: !isProd ? httpErr.stack : undefined,
    userId: req.user?.user_id,
    // Request context (safe - no sensitive data)
    bodyKeys: req.body ? Object.keys(req.body) : undefined,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    params: Object.keys(req.params).length > 0 ? req.params : undefined,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    // Error details (if provided)
    details: httpErr.details,
  };

  // Log server errors as errors, client errors as warnings
  if (status >= 500) {
    logger.error('Request error', errorLog);
  } else if (status >= 400) {
    logger.warn('Client error', errorLog);
  } else {
    logger.info('Request completed with non-2xx status', errorLog);
  }

  // Security: Only return safe error messages to clients
  // In production, hide internal error details for 500 errors
  const clientMessage = isProd && status === 500
    ? 'Internal Server Error'
    : httpErr.message || 'An error occurred';

  // Build response
  const response = {
    error: clientMessage,
    ...(requestId && { requestId }),
    ...(httpErr.code && { code: httpErr.code }),
    // Include details in development or for specific error types
    ...((!isProd || status < 500) && httpErr.details && { details: httpErr.details }),
  };

  // Add retry-after header for rate limit errors
  if (status === 429 && httpErr.retryAfter) {
    res.setHeader('Retry-After', httpErr.retryAfter);
  }

  res.status(status).json(response);
};
