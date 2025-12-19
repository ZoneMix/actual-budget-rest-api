/**
 * Centralized rate limiter configurations.
 *
 * Reusable rate limiters for different operation types across routes.
 * All limiters use standard rate limit headers and consistent error messages.
 */

import rateLimit from 'express-rate-limit';
import { logAuthEvent } from '../logging/logger.js';

// ============================================================================
// Standard Operation Limiters
// ============================================================================

/**
 * Standard write operation limiter.
 * Used for most create/update operations: 30 requests per minute
 */
export const standardWriteLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: { error: 'Too many write operations. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Delete operation limiter (stricter than writes).
 * Used for delete operations: 10 requests per minute
 */
export const deleteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many delete operations. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Bulk operation limiter.
 * Used for bulk imports/adds: 50 requests per minute
 */
export const bulkOperationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 50,
  message: { error: 'Too many bulk operations. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * High-frequency operation limiter.
 * Used for frequently accessed endpoints: 100 requests per minute
 */
export const highFrequencyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================================
// Specialized Operation Limiters
// ============================================================================

/**
 * Budget operation limiter.
 * Used for budget-related endpoints: 60 requests per minute
 */
export const budgetLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many budget operations. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Category group limiter.
 * Used for category group operations: 20 requests per minute
 */
export const categoryGroupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many category group operations. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Query limiter (stricter for security).
 * Used for arbitrary query endpoints: 20 requests per minute
 */
export const queryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many query requests. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================================
// Authentication Limiters
// ============================================================================

/**
 * Basic login limiter (no logging).
 * Very strict: 5 requests per 15 minutes
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Login limiter with auth event logging.
 * Same limits as loginLimiter but logs rate limit events for security monitoring.
 */
export const loginLimiterWithLogging = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logAuthEvent('RATE_LIMITED', null, { ip: req.ip, endpoint: '/auth/login' }, false);
    res.status(429).json({ error: 'Too many login attempts. Try again later.' });
  },
});
