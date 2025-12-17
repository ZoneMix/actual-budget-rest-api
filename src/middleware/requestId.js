/**
 * Request ID tracking middleware.
 * Generates or propagates request IDs for tracing requests through logs.
 */

import { randomUUID } from 'crypto';

export const requestIdMiddleware = (req, res, next) => {
  // Use existing request ID from headers or generate new one
  req.id = req.get('x-request-id') || randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
};
