/**
 * Sync policy for the embedded Actual engine.
 *
 * The wrapper used to call `api.sync()` before every single read, which is one
 * network round trip per GET. A sync is only worth paying for when the local
 * copy might actually be behind, so reads are gated on an interval and writes
 * mark the local copy fresh (or stale, when their post-write sync fails).
 *
 * State lives in a closure and is replaced wholesale on every update — there is
 * no exported mutable object for callers to reach into.
 */

import { ACTUAL_SYNC_MIN_INTERVAL_MS } from '../../config/index.js';

const INITIAL_STATE = Object.freeze({
  lastSyncAt: null,
  stale: true,
  lastSyncError: null,
});

/**
 * Builds an independent sync policy.
 *
 * @param {object} options
 * @param {number} options.minIntervalMs - age at which a successful sync goes stale
 * @param {function} [options.now] - injectable clock, defaults to Date.now
 */
export const createSyncPolicy = ({ minIntervalMs, now = Date.now } = {}) => {
  if (!Number.isFinite(minIntervalMs) || minIntervalMs < 0) {
    throw new TypeError(`createSyncPolicy requires a non-negative minIntervalMs, got: ${minIntervalMs}`);
  }

  let state = INITIAL_STATE;
  const update = (patch) => {
    state = Object.freeze({ ...state, ...patch });
  };

  /** True when the caller forced it, the policy is stale, or the last sync aged out. */
  const shouldSyncBefore = ({ force = false } = {}) => {
    if (force || state.stale || state.lastSyncAt === null) return true;
    return now() - state.lastSyncAt >= minIntervalMs;
  };

  /** Records a successful sync: fresh from this instant, and no outstanding error. */
  const markSynced = () => update({ lastSyncAt: now(), stale: false, lastSyncError: null });

  /** Forces the next read to sync, whatever the interval says. */
  const forceStale = () => update({ stale: true });

  /** Remembers why the last sync failed, for the health endpoint. */
  const recordSyncError = (error) =>
    update({
      lastSyncError: Object.freeze({
        message: error?.message ?? String(error),
        at: new Date(now()).toISOString(),
      }),
    });

  return {
    shouldSyncBefore,
    markSynced,
    forceStale,
    recordSyncError,
    lastSyncAt: () => state.lastSyncAt,
    lastSyncError: () => state.lastSyncError,
  };
};

/** The instance the runner and the health endpoint share. */
export const syncPolicy = createSyncPolicy({ minIntervalMs: ACTUAL_SYNC_MIN_INTERVAL_MS });
