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
 * The probes themselves live in ./health-checks.js; this file only assembles
 * their results into the response. In production, sensitive system information
 * is hidden to prevent information disclosure.
 */

import express from 'express';
import {
  isProduction,
  checkDatabase,
  checkActualApi,
  getSystemInfo,
} from './health-checks.js';

const router = express.Router();

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
