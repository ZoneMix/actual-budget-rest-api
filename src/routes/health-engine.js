/**
 * The Actual-engine probe behind GET /v2/health, and the shaping that decides
 * what of it is safe to hand an anonymous caller.
 *
 * Split from health-checks.js to keep both files well inside the size cap.
 *
 * Two rules govern everything here, and /v2/health has no auth middleware:
 *
 *   1. OBSERVE, never drive. The probe takes the engine only if initialisation
 *      already finished (`getActualApiIfReady`), so a poll cannot trigger
 *      `init()` plus a whole budget download, and it never touches the sync
 *      policy — a successful sync calls `markSynced()`, which nulls
 *      `lastSyncError` and would erase the diagnostic this endpoint exists to
 *      report.
 *   2. BOUNDED. The two engine calls run through the same queue as everything
 *      else, so an anonymous caller cannot interleave `getAccounts()` with
 *      someone else's mutation — but under ACTUAL_HEALTH_TIMEOUT_MS rather than
 *      the ordinary per-operation budget, so a queue held by a long export
 *      cannot take the liveness probe down with it.
 */

import { getActualApiIfReady, getQueueDepth, syncPolicy, withEngine } from '../services/actualApi.js';
import { GatewayTimeoutError, ServiceUnavailableError } from '../errors/index.js';
import { ACTUAL_HEALTH_TIMEOUT_MS, NODE_ENV } from '../config/index.js';
import { shapeSyncError } from './health-checks.js';
import logger from '../logging/logger.js';

const isProduction = NODE_ENV === 'production';

/**
 * Shapes the actualApi block for the response.
 *
 * `serverVersion` is the UPSTREAM Actual server's version, and /v2/health is
 * mounted without auth. A version string is exactly the input needed to match a
 * host against a CVE list, so it sits with `lastSyncError`'s message on the
 * development-only side of the line rather than going to anonymous callers.
 * The authenticated `GET /v2/server/version` still returns it.
 *
 * `hideDetails` is a parameter because `isProduction` is resolved at import
 * time, so the environment-dependent branch cannot be exercised through the
 * route itself.
 *
 * @param {object} check - result of `checkActualApi()`
 * @param {boolean} [hideDetails] - defaults to the running environment
 */
export const shapeActualApiCheck = (check, hideDetails = isProduction) => ({
  status: check.status,
  message: check.message,
  // Queue depth and last sync time are operational, not sensitive, so they are
  // reported everywhere; lastSyncError is already redacted by shapeSyncError().
  queueDepth: check.queueDepth,
  lastSyncAt: check.lastSyncAt,
  lastSyncError: check.lastSyncError,
  ...(hideDetails ? {} : { serverVersion: check.serverVersion, error: check.error }),
});

/**
 * The Actual server's version, or null when it cannot be determined.
 *
 * Best-effort: `getServerVersion()` has its own failure arm
 * (`{ error: 'no-server' | 'network-failure' }`) and can also throw, and a
 * health check that 500s over a nice-to-have field is worse than one reporting
 * null.
 *
 * @param {object} api - engine instance
 */
const readServerVersion = async (api) => {
  try {
    const result = await api.getServerVersion();
    return result?.version ?? null;
  } catch (error) {
    logger.warn('Actual server version check failed', { error: error.message });
    return null;
  }
};

/**
 * True when the engine did not answer because it is occupied rather than
 * broken: the probe's own budget expired (504) or the queue is at its depth cap
 * (503). Neither says anything about the engine's health, so they are reported
 * as `busy` rather than as a connection failure.
 */
const isBusyRejection = (error) =>
  error instanceof GatewayTimeoutError || error instanceof ServiceUnavailableError;

/**
 * Check Actual API connectivity and report the engine's operational state.
 *
 * `timeoutMs` is a parameter for the same reason `hideDetails` is above:
 * ACTUAL_HEALTH_TIMEOUT_MS is resolved at import time, so the expiry cannot be
 * reached through the route inside a test without waiting the full default.
 *
 * @param {object} [options]
 * @param {number} [options.timeoutMs] - budget for the two engine calls
 */
export const checkActualApi = async ({ timeoutMs = ACTUAL_HEALTH_TIMEOUT_MS } = {}) => {
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

  const api = getActualApiIfReady();
  if (!api) {
    return {
      status: 'not-initialised',
      message: 'Actual API has not finished initializing',
      ...engine,
      serverVersion: null,
    };
  }

  try {
    // One queued task for both calls: two would queue separately and double
    // the probe's exposure to whatever else is running.
    const serverVersion = await withEngine('health', async () => {
      await api.getAccounts();
      return readServerVersion(api);
    }, { timeoutMs });

    return {
      status: 'ok',
      message: 'Actual API connection healthy',
      ...engine,
      serverVersion,
    };
  } catch (error) {
    if (isBusyRejection(error)) {
      // The task itself stays queued and will run when the queue drains; the
      // timeout only stops the probe waiting for it.
      logger.warn('Actual API health check could not reach the engine', {
        reason: error.name,
        queueDepth: engine.queueDepth,
      });
      return {
        status: 'busy',
        message: 'Actual engine did not answer within the health check budget',
        ...engine,
        serverVersion: null,
        ...(isProduction ? {} : { error: error.message }),
      };
    }

    logger.error('Actual API health check failed', { error: error.message });
    // In production, don't expose error details
    return {
      status: 'error',
      message: 'Actual API connection failed',
      ...engine,
      serverVersion: null,
      ...(isProduction ? {} : { error: error.message }),
    };
  }
};
