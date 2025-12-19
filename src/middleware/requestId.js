/**
 * Request ID tracking middleware.
 *
 * Generates or propagates request IDs for tracing requests through logs.
 * If a client sends an X-Request-ID header, it's used; otherwise a new UUID is generated.
 * The request ID is included in all error responses and log entries.
 *
 * This is the first middleware in the chain to ensure all requests have an ID.
 */

import { randomUUID } from 'crypto';

/**
 * Middleware to attach request ID to request and response.
 *
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next function
 */
export const requestIdMiddleware = (req, res, next) => {
  // Use existing request ID from headers or generate new one
  req.id = req.get('x-request-id') || randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
};
