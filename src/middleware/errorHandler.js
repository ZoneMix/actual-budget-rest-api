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

/**
 * Create an HTTP error with a status code.
 * These errors are caught by the error handler middleware.
 *
 * @param {number} status - HTTP status code
 * @param {string} message - Error message
 * @returns {Error} Error object with status property
 */
export const httpError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

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
  const status = err.status || 500;
  const requestId = req.id;
  const isProd = process.env.NODE_ENV === 'production';

  // Log detailed error server-side with full context
  const errorLog = {
    requestId,
    method: req.method,
    url: req.originalUrl,
    status,
    message: err.message,
    stack: !isProd ? err.stack : undefined,
    userId: req.user?.user_id,
  };

  // Log server errors as errors, client errors as warnings
  if (status >= 500) {
    logger.error('Request error', errorLog);
  } else {
    logger.warn('Client error', errorLog);
  }

  // Security: Only return safe error messages to clients
  // In production, hide internal error details for 500 errors
  const clientMessage = isProd && status === 500
    ? 'Internal Server Error'
    : err.message || 'An error occurred';

  res.status(status).json({
    error: clientMessage,
    ...(requestId && { requestId }),
  });
};
