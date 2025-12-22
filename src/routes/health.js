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
import { getActualApi } from '../services/actualApi.js';
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
const checkActualApi = async () => {
  try {
    const api = await getActualApi();
    // Try to get accounts as a connectivity test
    await api.getAccounts();
    return { status: 'ok', message: 'Actual API connection healthy' };
  } catch (error) {
    logger.error('Actual API health check failed', { error: error.message });
    // In production, don't expose error details
    return { 
      status: 'error', 
      message: 'Actual API connection failed',
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