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
import { getMetrics, resetMetrics, register } from '../middleware/metrics.js';
import { authenticateJWT } from '../auth/jwt.js';
import { requireScope } from '../auth/permissions.js';
import { SCOPES } from '../auth/scopes.js';
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
 * Resets all metrics counters. Destroys observability data, so it is the one
 * metrics endpoint that is admin-only in every environment: the router-level
 * `authenticateJWT` above only applies in production, so outside production
 * this route authenticates on its own. The admin scope check follows
 * AUTH_SCOPE_ENFORCEMENT like every other requireScope() call.
 */
const resetGuards = isProduction
  ? [requireScope(SCOPES.ADMIN)]
  : [authenticateJWT, requireScope(SCOPES.ADMIN)];

router.post('/reset', ...resetGuards, (req, res) => {
  resetMetrics();
  
  sendSuccess(res, { message: 'Metrics reset successfully' });
});

/**
 * GET /metrics/prometheus
 *
 * Returns metrics in Prometheus format for scraping.
 * This endpoint is typically not protected as Prometheus needs to scrape it.
 */
router.get('/prometheus', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (err) {
    res.status(500).end(err.message);
  }
});

export default router;

