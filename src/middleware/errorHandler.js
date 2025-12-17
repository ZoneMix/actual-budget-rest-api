/**
 * Shared error utilities and global Express error handler.
 */
import logger from '../logging/logger.js';

export const httpError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

export const errorHandler = (err, req, res, _next) => {
  const status = err.status || 500;
  const requestId = req.id;
  const isProd = process.env.NODE_ENV === 'production';

  // Log detailed error server-side
  const errorLog = {
    requestId,
    method: req.method,
    url: req.originalUrl,
    status,
    message: err.message,
    stack: !isProd ? err.stack : undefined,
    userId: req.user?.user_id,
  };

  if (status >= 500) {
    logger.error('Request error', errorLog);
  } else {
    logger.warn('Client error', errorLog);
  }

  // Only return safe error messages to clients
  const clientMessage = isProd && status === 500
    ? 'Internal Server Error'
    : err.message || 'An error occurred';

  res.status(status).json({
    error: clientMessage,
    ...(requestId && { requestId }),
  });
};
