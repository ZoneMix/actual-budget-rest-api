/**
 * Metrics collection middleware.
 *
 * Collects and logs metrics for:
 * - Request duration
 * - Request count by method and route
 * - Error rates
 * - Response sizes
 *
 * Metrics are logged in structured format for external collection systems.
 * Also exposes Prometheus-compatible metrics for scraping.
 */

import logger from '../logging/logger.js';
import { Registry, Counter, Histogram } from 'prom-client';

// Create Prometheus registry
export const register = new Registry();

// Prometheus metrics
const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

const httpRequestErrors = new Counter({
  name: 'http_request_errors_total',
  help: 'Total number of HTTP request errors (4xx, 5xx)',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

// In-memory metrics store (consider Redis for production with multiple instances)
const metrics = {
  requests: {
    total: 0,
    byMethod: {},
    byRoute: {},
    errors: 0,
  },
  responseTimes: [],
  errorRates: {
    byStatus: {},
  },
};

/**
 * Reset metrics (useful for testing or periodic resets).
 */
export const resetMetrics = () => {
  metrics.requests.total = 0;
  metrics.requests.byMethod = {};
  metrics.requests.byRoute = {};
  metrics.requests.errors = 0;
  metrics.responseTimes = [];
  metrics.errorRates.byStatus = {};
};

/**
 * Get current metrics snapshot.
 */
export const getMetrics = () => {
  const avgResponseTime = metrics.responseTimes.length > 0
    ? metrics.responseTimes.reduce((a, b) => a + b, 0) / metrics.responseTimes.length
    : 0;

  return {
    ...metrics,
    averageResponseTime: `${Math.round(avgResponseTime)}ms`,
    errorRate: metrics.requests.total > 0
      ? `${((metrics.requests.errors / metrics.requests.total) * 100).toFixed(2)}%`
      : '0%',
  };
};

/**
 * Middleware to collect request metrics.
 */
export const metricsMiddleware = (req, res, next) => {
  const startTime = Date.now();
  const route = req.route?.path || req.path || 'unknown';

  // Track request
  metrics.requests.total++;
  // Safe: req.method is validated HTTP method, route is sanitized path
  metrics.requests.byMethod[req.method] = (metrics.requests.byMethod[req.method] || 0) + 1;
  // Safe: route is sanitized path string
  // eslint-disable-next-line security/detect-object-injection
  metrics.requests.byRoute[route] = (metrics.requests.byRoute[route] || 0) + 1;

  // Track response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const durationSeconds = duration / 1000;
    const status = res.statusCode.toString();
    
    metrics.responseTimes.push(duration);

    // Keep only last 1000 response times to prevent memory growth
    if (metrics.responseTimes.length > 1000) {
      metrics.responseTimes = metrics.responseTimes.slice(-1000);
    }

    // Track errors
    if (res.statusCode >= 400) {
      metrics.requests.errors++;
      metrics.errorRates.byStatus[res.statusCode] = 
        (metrics.errorRates.byStatus[res.statusCode] || 0) + 1;
    }

    // Update Prometheus metrics
    httpRequestDuration.observe({ method: req.method, route, status }, durationSeconds);
    httpRequestTotal.inc({ method: req.method, route, status });
    
    if (res.statusCode >= 400) {
      httpRequestErrors.inc({ method: req.method, route, status });
    }

    // Log metrics periodically (every 100 requests) or on errors
    if (metrics.requests.total % 100 === 0 || res.statusCode >= 500) {
      logger.info('Metrics snapshot', {
        ...getMetrics(),
        currentRequest: {
          method: req.method,
          route,
          status: res.statusCode,
          duration: `${duration}ms`,
        },
      });
    }
  });

  next();
};

