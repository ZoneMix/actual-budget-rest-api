/**
 * The single path every domain function takes into the Actual engine.
 *
 * `runWithApi(label, fn, { mode, force, syncBefore })` serialises the call
 * through the engine queue and applies the sync policy around it:
 *   - read  → sync first only if the local copy may be behind, then run fn
 *   - write → run fn first, then sync; a failed post-write sync is logged and
 *             absorbed, because the mutation itself already succeeded
 *   - write + syncBefore → sync first as well, unconditionally. For a
 *             read-modify-write, whose fn reads the state it is about to
 *             overwrite, a pre-sync failure aborts before fn runs rather than
 *             letting a merge built on a stale copy be pushed upstream.
 */

import { Histogram, Gauge, Counter } from 'prom-client';
import { register } from '../../middleware/metrics.js';
import logger from '../../logging/logger.js';
import { getActualApi, recoverBudget } from './client.js';
import { withEngine, getQueueDepth } from './queue.js';
import { syncPolicy } from './syncPolicy.js';

/**
 * Registers a metric once. Test runs re-import this module against the same
 * registry, and prom-client throws on a duplicate metric name.
 */
const getOrCreate = (name, Metric, options) =>
  register.getSingleMetric(name) ?? new Metric({ name, registers: [register], ...options });

// `outcome` is on the histogram rather than in a separate failure counter so a
// failing engine still produces latency data and the success rate is derivable
// from one metric: sum by (outcome) of actual_engine_op_duration_seconds_count.
const opDuration = getOrCreate('actual_engine_op_duration_seconds', Histogram, {
  help: 'Duration of Actual engine operations in seconds, by outcome',
  labelNames: ['label', 'mode', 'outcome'],
  buckets: [0.005, 0.025, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
});

const queueDepth = getOrCreate('actual_engine_queue_depth', Gauge, {
  help: 'Actual engine operations currently queued or running',
});

const syncFailures = getOrCreate('actual_engine_sync_failures_total', Counter, {
  help: 'Total number of failed post-write syncs against the Actual server',
});

/**
 * Syncs before an operation runs, recovering from an unloaded budget.
 * Throws a wrapped, actionable error when the sync cannot be recovered — the
 * caller is about to read, so proceeding on a copy that may be behind is worse
 * than failing.
 */
const syncBeforeOperation = async (instance, label) => {
  try {
    await instance.sync();
  } catch (error) {
    logger.error('[Actual] Sync failed before operation', {
      label,
      error: error.message,
      stack: error.stack,
    });

    // If sync fails with getPrefs null error, the budget might not be loaded
    // Try to re-download the budget and retry once
    if (error.message?.includes('getPrefs') || error.message?.includes('Cannot destructure')) {
      await recoverBudget(instance, error);
    } else {
      throw new Error(`Failed to sync with Actual Budget server: ${error.message}. Ensure the budget is properly initialized and ACTUAL_SYNC_ID is correct.`);
    }
  }
  syncPolicy.markSynced();
};

/**
 * Syncs after a write. Never throws: the mutation already landed locally, so
 * failing the request here would misreport a success. The policy is marked
 * stale instead, which makes the next read sync.
 */
const syncAfterWrite = async (instance, label) => {
  try {
    await instance.sync();
    syncPolicy.markSynced();
  } catch (error) {
    logger.error('[Actual] Sync failed after operation', {
      label,
      error: error.message,
      stack: error.stack,
    });
    syncPolicy.forceStale();
    syncPolicy.recordSyncError(error);
    syncFailures.inc();
  }
};

/**
 * Runs an engine operation under the queue and the sync policy.
 *
 * @param {string} label - operation name, used for logs and metrics
 * @param {function} fn - receives the engine instance
 * @param {object} [options]
 * @param {'read'|'write'} [options.mode] - read syncs before, write syncs after
 * @param {boolean} [options.force] - force a pre-read sync regardless of interval
 * @param {boolean} [options.syncBefore] - write mode only: also sync before fn,
 *   for a read-modify-write that must not merge onto a stale copy
 * @param {number} [options.timeoutMs] - caller-side budget for this call,
 *   overriding ACTUAL_OP_TIMEOUT_MS. Raised for the whole-ledger operations
 *   (budget load/export), which are network-bound and would otherwise time out
 *   and hold the queue slot until the engine call settled anyway.
 */
export const runWithApi = async (label, fn, { mode = 'read', force = false, syncBefore = false, timeoutMs } = {}) =>
  withEngine(label, async () => {
    const started = Date.now();
    queueDepth.set(getQueueDepth());

    // Pessimistic default: only the success path clears it, so anything that
    // throws — init, pre-read sync, or fn itself — is still observed.
    let outcome = 'error';
    try {
      const instance = await getActualApi();

      // A read gates on the policy interval; an opted-in write syncs
      // unconditionally, since "recent enough" is not good enough when fn is
      // about to read the rows it will overwrite.
      const needsPreSync = mode === 'read'
        ? syncPolicy.shouldSyncBefore({ force })
        : syncBefore;

      if (needsPreSync) {
        await syncBeforeOperation(instance, label);
      }

      const result = await fn(instance);

      if (mode === 'write') {
        await syncAfterWrite(instance, label);
      }

      outcome = 'success';
      return result;
    } finally {
      const duration = Date.now() - started;
      if (outcome === 'success') {
        logger.info('[Actual] operation completed', { label, durationMs: duration });
      } else {
        logger.warn('[Actual] operation failed', { label, mode, durationMs: duration });
      }
      opDuration.observe({ label, mode, outcome }, duration / 1000);
      queueDepth.set(getQueueDepth());
    }
  }, { timeoutMs });
