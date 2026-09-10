/**
 * Health check endpoint.
 *
 * Provides comprehensive health status including:
 * - Application status
 * - Database connectivity
 * - Actual API connectivity
 * - System resources (development only)
 * - Uptime information (development only)
 *
 * In production, sensitive system information is hidden to prevent information disclosure.
 */

import express from 'express';
import { getRow } from '../db/authDb.js';
import { getActualApi, getQueueDepth, syncPolicy, serverVersion } from '../services/actualApi.js';
import { NODE_ENV } from '../config/index.js';
import logger from '../logging/logger.js';

const router = express.Router();
const isProduction = NODE_ENV === 'production';

/**
 * Check database connectivity.
 */
const checkDatabase = async () => {
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
 * Check Actual API connectivity.
 */
/**
 * Shapes the last sync error for the response.
 *
 * The message is the raw error from `instance.sync()`, so it can carry the
 * Actual server's host, port or connection details — and /v2/health is mounted
 * without auth. In production only the timestamp is emitted, which is enough to
 * see that syncs are failing and for how long; the message stays in the logs.
 *
 * Exported for testing: `isProduction` is resolved at import time, so the
 * environment-dependent branch cannot be exercised through the route itself.
 *
 * @param {object|null} lastSyncError - `{ message, at }` from the sync policy
 * @param {boolean} [hideDetails] - defaults to the running environment
 */
export const shapeSyncError = (lastSyncError, hideDetails = isProduction) => {
  if (!lastSyncError) return null;
  return hideDetails ? { at: lastSyncError.at } : lastSyncError;
};

/**
 * The Actual server's version, or null when it cannot be determined.
 *
 * Best-effort on purpose: `getServerVersion()` has its own failure arm
 * (`{ error: 'no-server' | 'network-failure' }`) and can also throw, and a
 * health check that 500s because a nice-to-have field is unavailable is worse
 * than one that reports null. The version answers "which server am I actually
 * talking to", which is the first question when syncs start failing.
 */
const readServerVersion = async () => {
  try {
    const result = await serverVersion();
    return result?.version ?? null;
  } catch (error) {
    logger.warn('Actual server version check failed', { error: error.message });
    return null;
  }
};

const checkActualApi = async () => {
  // Queue depth and last sync time are operational, not sensitive, so they are
  // reported everywhere; the sync error message is redacted in production.
  const engine = {
    queueDepth: getQueueDepth(),
    lastSyncAt: syncPolicy.lastSyncAt(),
    lastSyncError: shapeSyncError(syncPolicy.lastSyncError()),
    serverVersion: await readServerVersion(),
  };

  try {
    const api = await getActualApi();
    // Try to get accounts as a connectivity test
    await api.getAccounts();
    return { status: 'ok', message: 'Actual API connection healthy', ...engine };
  } catch (error) {
    logger.error('Actual API health check failed', { error: error.message });
    // In production, don't expose error details
    return {
      status: 'error',
      message: 'Actual API connection failed',
      ...engine,
      ...(isProduction ? {} : { error: error.message })
    };
  }
};

/**
 * Get system resource information.
 * Only includes detailed information in development to prevent information disclosure.
 */
const getSystemInfo = () => {
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

/**
 * GET /health
 *
 * Returns comprehensive health status.
 * Returns 503 if critical services are unavailable.
 *
 * Information disclosure prevention:
 * - Production: Only shows service status (ok/error), no system details
 * - Development: Shows full system information (memory, uptime, node version, etc.)
 */
router.get('/', async (req, res) => {
  const databaseCheck = await checkDatabase();
  const actualApiCheck = await checkActualApi();
  const systemInfo = getSystemInfo();

  // Determine overall status
  const hasErrors = databaseCheck.status === 'error' || actualApiCheck.status === 'error';
  const overallStatus = hasErrors ? 'degraded' : 'ok';

  // Build response based on environment
  const checks = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    checks: {
      database: {
        status: databaseCheck.status,
        message: databaseCheck.message,
        // Only include error details in development
        ...(isProduction ? {} : { error: databaseCheck.error }),
      },
      actualApi: {
        status: actualApiCheck.status,
        message: actualApiCheck.message,
        // Engine queue and sync state; lastSyncError is already redacted for
        // production by shapeSyncError() in checkActualApi().
        queueDepth: actualApiCheck.queueDepth,
        lastSyncAt: actualApiCheck.lastSyncAt,
        lastSyncError: actualApiCheck.lastSyncError,
        serverVersion: actualApiCheck.serverVersion,
        // Only include error details in development
        ...(isProduction ? {} : { error: actualApiCheck.error }),
      },
      // System info is already filtered by getSystemInfo()
      ...(isProduction ? {} : { system: systemInfo }),
    },
  };

  // Return appropriate status code
  const statusCode = overallStatus === 'ok' ? 200 : 503;
  res.status(statusCode).json(checks);
});

export default router;