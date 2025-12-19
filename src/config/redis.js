/**
 * Redis configuration and connection management.
 *
 * Provides Redis client for rate limiting and other distributed features.
 * Falls back to in-memory store if Redis is not configured.
 */

import Redis from 'ioredis';
import logger from '../logging/logger.js';
import env, { isRedisConfigured } from './env.js';

let redisClient = null;

/**
 * Get or create Redis client.
 * Returns null if Redis is not configured (will use memory store).
 */
export const getRedisClient = () => {
  if (redisClient) return redisClient;
  
  if (!isRedisConfigured()) {
    logger.info('Redis not configured, using in-memory rate limiting');
    return null;
  }

  try {
    if (env.REDIS_URL) {
      redisClient = new Redis(env.REDIS_URL, {
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true,
      });
    } else {
      redisClient = new Redis({
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        password: env.REDIS_PASSWORD,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true,
      });
    }

    redisClient.on('error', (err) => {
      logger.error('Redis connection error', { error: err.message });
      // Don't crash - fall back to memory store
      redisClient = null;
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    redisClient.on('ready', () => {
      logger.info('Redis ready for commands');
    });

    // Connect asynchronously
    redisClient.connect().catch((err) => {
      logger.warn('Redis connection failed, falling back to memory store', { error: err.message });
      redisClient = null;
    });

    return redisClient;
  } catch (error) {
    logger.error('Failed to create Redis client', { error: error.message });
    return null;
  }
};

/**
 * Close Redis connection gracefully.
 */
export const closeRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis connection closed');
  }
};

/**
 * Check if Redis is available and connected.
 */
export const isRedisAvailable = () => {
  return redisClient !== null && redisClient.status === 'ready';
};

