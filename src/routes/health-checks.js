/**
 * The individual probes behind GET /v2/health.
 *
 * Split out of health.js so the router stays a thin assembler. The governing
 * rule for everything here: a health check OBSERVES the system, it never drives
 * it. No probe may enqueue an engine operation, trigger a sync, or mutate the
 * sync policy — see `readServerVersion` for what that costs when ignored.
 *
 * In production, sensitive detail is withheld to prevent information disclosure.
 */

import { getRow } from '../db/authDb.js';
import { getActualApi, getQueueDepth, syncPolicy } from '../services/actualApi.js';
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
 * The Actual server's version, or null when it cannot be determined.
 *
 * Called on the engine instance DIRECTLY, never through the `serverVersion()`
 * service. That service goes through `runWithApi(..., { mode: 'read' })`, and a
 * read there does two things a health check must never do:
 *
 *   1. It may sync first, and a successful sync calls `syncPolicy.markSynced()`,
 *      which nulls `lastSyncError` — so a polled health check would erase the
 *      very diagnostic this endpoint exists to report.
 *   2. It enters the engine queue. /v2/health has no auth, so its latency would
 *      become queue depth plus ACTUAL_OP_TIMEOUT_MS (one slow export takes the
 *      liveness probe down with it) and an anonymous caller could push sync
 *      traffic at the Actual server.
 *
 * The authenticated GET /v2/server/version keeps the queued service.
 *
 * Best-effort either way: `getServerVersion()` has its own failure arm
 * (`{ error: 'no-server' | 'network-failure' }`) and can also throw, and a
 * health check that 500s over a nice-to-have field is worse than one reporting
 * null.
 *
 * @param {object|null} api - engine instance, or null when it never initialised
 */
const readServerVersion = async (api) => {
  if (!api) return null;

  try {
    const result = await api.getServerVersion();
    return result?.version ?? null;
  } catch (error) {
    logger.warn('Actual server version check failed', { error: error.message });
    return null;
  }
};

/**
 * Check Actual API connectivity and report the engine's operational state.
 */
export const checkActualApi = async () => {
  // Snapshot the sync-policy fields BEFORE any await. They are shared mutable
  // state, so reading them after the I/O below would report whatever a
  // concurrent request had just written — and inlining them into an object
  // literal alongside an `await` makes the correctness depend on property
  // order, which the next edit can silently reverse.
  //
  // Queue depth and last sync time are operational, not sensitive, so they are
  // reported everywhere; the sync error message is redacted in production.
  const engine = {
    queueDepth: getQueueDepth(),
    lastSyncAt: syncPolicy.lastSyncAt(),
    lastSyncError: shapeSyncError(syncPolicy.lastSyncError()),
  };

  let api = null;
  try {
    api = await getActualApi();
    // Try to get accounts as a connectivity test
    await api.getAccounts();
  } catch (error) {
    logger.error('Actual API health check failed', { error: error.message });
    // In production, don't expose error details
    return {
      status: 'error',
      message: 'Actual API connection failed',
      ...engine,
      // Still attempted: when connectivity is broken, "which server am I
      // pointed at" is exactly the question being asked.
      serverVersion: await readServerVersion(api),
      ...(isProduction ? {} : { error: error.message })
    };
  }

  return {
    status: 'ok',
    message: 'Actual API connection healthy',
    ...engine,
    serverVersion: await readServerVersion(api),
  };
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
