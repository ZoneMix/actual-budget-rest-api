/**
 * The database and system probes behind GET /v2/health, plus the redaction
 * shared with the engine probe.
 *
 * Split out of health.js so the router stays a thin assembler; the Actual
 * engine probe lives in ./health-engine.js, which is where the governing rule
 * for everything here is spelled out: a health check OBSERVES the system, it
 * never drives it.
 *
 * In production, sensitive detail is withheld to prevent information disclosure.
 */

import { getRow } from '../db/authDb.js';
import { NODE_ENV } from '../config/index.js';
import logger from '../logging/logger.js';

export const isProduction = NODE_ENV === 'production';

/**
 * Check database connectivity.
 */
export const checkDatabase = async () => {
  try {
    // Simple query to verify connection
    await getRow('SELECT 1');
    return { status: 'ok', message: 'Database connection healthy' };
  } catch (error) {
    logger.error('Database health check failed', { error: error.message });
    // In production, don't expose error details
    return {
      status: 'error',
      message: 'Database connection failed',
      ...(isProduction ? {} : { error: error.message })
    };
  }
};

/**
 * Shapes the last sync error for the response.
 *
 * The message is the raw error from `instance.sync()`, so it can carry the
 * Actual server's host, port or connection details — and /v2/health is mounted
 * without auth. In production only the timestamp is emitted, which is enough to
 * see that syncs are failing and for how long; the message stays in the logs.
 *
 * `hideDetails` is a parameter because `isProduction` is resolved at import
 * time, so the environment-dependent branch cannot be exercised through the
 * route itself.
 *
 * @param {object|null} lastSyncError - `{ message, at }` from the sync policy
 * @param {boolean} [hideDetails] - defaults to the running environment
 */
export const shapeSyncError = (lastSyncError, hideDetails = isProduction) => {
  if (!lastSyncError) return null;
  return hideDetails ? { at: lastSyncError.at } : lastSyncError;
};

/**
 * Get system resource information.
 * Only includes detailed information in development to prevent information disclosure.
 */
export const getSystemInfo = () => {
  if (isProduction) {
    // Production: Minimal information only
    return {
      status: 'ok',
      // Don't expose memory details, node version, platform, or uptime in production
    };
  }

  // Development: Full system information
  const usage = process.memoryUsage();
  return {
    memory: {
      rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
      external: `${Math.round(usage.external / 1024 / 1024)}MB`,
    },
    uptime: `${Math.round(process.uptime())}s`,
    nodeVersion: process.version,
    platform: process.platform,
  };
};
