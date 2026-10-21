/**
 * CORS policy: only the origins in ALLOWED_ORIGINS, plus origin-less callers.
 *
 * Extracted from src/app.js, which sits at its 200-line cap.
 */

import cors from 'cors';
import logger from '../logging/logger.js';

/**
 * @param {string[]} allowedOrigins - exact origins a browser may call from
 * @returns {function} configured cors() middleware
 */
export const createCorsMiddleware = (allowedOrigins) => {
  logger.info('CORS configuration', {
    allowedOrigins,
    originCount: allowedOrigins.length,
  });

  return cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn('CORS blocked request from origin', {
          origin,
          allowedOrigins,
          hint: 'Add the origin to ALLOWED_ORIGINS environment variable',
        });
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    maxAge: 86400, // 24 hours
  });
};
