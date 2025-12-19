/**
 * Centralized rate limiter configurations.
 *
 * Reusable rate limiters for different operation types across routes.
 * All limiters use standard rate limit headers and consistent error messages.
 *
 * Supports Redis for distributed rate limiting (when configured),
 * falls back to in-memory store for single-instance deployments.
 */

import rateLimit from 'express-rate-limit';
import { logAuthEvent } from '../logging/logger.js';
import { getRedisClient, isRedisAvailable } from '../config/redis.js';
import logger from '../logging/logger.js';

// Initialize Redis store on module load (if Redis is configured)
let redisStore = null;

/**
 * Initialize Redis store for rate limiting.
 * Called once on module load if Redis is available.
 */
const initializeRedisStore = async () => {
  const redis = getRedisClient();
  if (!redis || !isRedisAvailable()) {
    return null;
  }

  try {
    // Dynamic import for ES modules
    const redisStoreModule = await import('rate-limit-redis');
    const RedisStore = redisStoreModule.default || redisStoreModule;
    
    redisStore = new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix: 'rl:',
    });
    
    logger.info('Redis rate limiting store initialized');
    return redisStore;
  } catch (error) {
    logger.warn('rate-limit-redis not available, using memory store', { 
      error: error.message,
      hint: 'Install rate-limit-redis package for distributed rate limiting'
    });
    return null;
  }
};

// Initialize asynchronously (won't block module load)
initializeRedisStore().catch(() => {
  // Silently fail - will use memory store
});

/**
 * Get rate limiter store (Redis if available, otherwise memory).
 * Returns undefined to use default memory store if Redis is not available.
 */
const getStore = () => {
  return redisStore || undefined; // undefined = use default memory store
};

// ============================================================================
// Standard Operation Limiters
// ============================================================================

/**
 * Standard write operation limiter.
 * Used for most create/update operations: 30 requests per minute
 */
export const standardWriteLimiter = rateLimit({
  store: getStore(),
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
  store: getStore(),
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
  store: getStore(),
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
  store: getStore(),
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
  store: getStore(),
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
  store: getStore(),
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
  store: getStore(),
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
  store: getStore(),
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
  store: getStore(),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logAuthEvent('RATE_LIMITED', null, { ip: req.ip, endpoint: '/auth/login' }, false);
    res.status(429).json({ error: 'Too many login attempts. Try again later.' });
  },
});
