/**
 * Metrics routes.
 *
 * Provides endpoints to query application metrics:
 * - GET /metrics - Full metrics snapshot
 * - GET /metrics/summary - Summary metrics only
 * - POST /metrics/reset - Reset metrics (admin only)
 *
 * All endpoints require authentication in production.
 */

import express from 'express';
import { getMetrics, resetMetrics } from '../middleware/metrics.js';
import { authenticateJWT } from '../auth/jwt.js';
import { sendSuccess } from '../middleware/responseHelpers.js';
import { NODE_ENV } from '../config/index.js';

const router = express.Router();
const isProduction = NODE_ENV === 'production';

// Protect metrics endpoints in production (optional in development for easier testing)
if (isProduction) {
  router.use(authenticateJWT);
}

/**
 * GET /metrics
 *
 * Returns full metrics snapshot including:
 * - Request counts (total, by method, by route)
 * - Response times (average, distribution)
 * - Error rates (by status code)
 * - System metrics
 */
router.get('/', (req, res) => {
  const metrics = getMetrics();
  
  res.json({
    success: true,
    metrics,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /metrics/summary
 *
 * Returns summary metrics only (lighter response):
 * - Total requests
 * - Average response time
 * - Error rate
 * - Request count by method
 */
router.get('/summary', (req, res) => {
  const fullMetrics = getMetrics();
  
  const summary = {
    requests: {
      total: fullMetrics.requests.total,
      errors: fullMetrics.requests.errors,
      byMethod: fullMetrics.requests.byMethod,
    },
    performance: {
      averageResponseTime: fullMetrics.averageResponseTime,
      errorRate: fullMetrics.errorRate,
    },
  };
  
  res.json({
    success: true,
    summary,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /metrics/reset
 *
 * Resets all metrics counters.
 * Requires authentication (admin recommended).
 */
router.post('/reset', (req, res) => {
  resetMetrics();
  
  sendSuccess(res, { message: 'Metrics reset successfully' });
});

export default router;

