/**
 * Structured access log: one line per completed request.
 *
 * Extracted from src/app.js, which sits at its 200-line cap.
 */

import logger from '../logging/logger.js';

/**
 * Logs method, path, status and duration once the response has been flushed.
 *
 * The PATH is logged, never `req.originalUrl`. Access logs are shipped and
 * retained, and the query string is where credentials turn up: the OAuth
 * authorize redirect, a pasted `?token=`, a password in a mistyped GET.
 *
 * The path is captured at entry rather than read inside the finish handler,
 * because the routers rewrite `req.url` and `req.baseUrl` while they dispatch
 * and there is no guarantee the stack has unwound by the time `finish` fires.
 */
export const accessLogMiddleware = (req, res, next) => {
  const started = Date.now();
  const path = req.baseUrl + req.path;

  res.on('finish', () => {
    const duration = Date.now() - started;
    logger.info('Request completed', {
      requestId: req.id,
      method: req.method,
      url: path,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  });

  next();
};
