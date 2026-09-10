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
import { isProduction, checkDatabase, getSystemInfo } from './health-checks.js';
import { checkActualApi, shapeActualApiCheck } from './health-engine.js';

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

  // Anything but `ok` is degraded. The engine probe has three failure answers
  // — `error` (it refused), `busy` (it did not answer inside the health budget)
  // and `not-initialised` (startup has not finished) — and all three mean this
  // instance cannot serve requests, so all three must reach the orchestrator as
  // a 503 rather than only the first.
  const hasErrors = databaseCheck.status !== 'ok' || actualApiCheck.status !== 'ok';
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
      // shapeActualApiCheck() decides what is safe to emit: the raw error and
      // the upstream server version are development-only.
      actualApi: shapeActualApiCheck(actualApiCheck),
      // System info is already filtered by getSystemInfo()
      ...(isProduction ? {} : { system: systemInfo }),
    },
  };

  // Return appropriate status code
  const statusCode = overallStatus === 'ok' ? 200 : 503;
  res.status(statusCode).json(checks);
});

export default router;
