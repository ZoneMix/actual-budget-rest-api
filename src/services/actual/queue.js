/**
 * FIFO queue in front of the single embedded Actual engine.
 *
 * `@actual-app/api` drives one in-process engine with one budget file open.
 * Concurrent HTTP requests would otherwise interleave `sync()` and mutations
 * on it, so every engine call is funnelled through a promise chain here.
 *
 * Three guarantees:
 * - FIFO: tasks run one at a time, in the order they were enqueued.
 * - Backpressure: past ACTUAL_QUEUE_MAX_DEPTH pending tasks, callers get a 503.
 * - Reentrancy: an engine call made from inside a running task (e.g. a
 *   `batchBudgetUpdates` callback) runs inline instead of enqueueing, which
 *   would deadlock the chain on itself.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { ACTUAL_QUEUE_MAX_DEPTH, ACTUAL_OP_TIMEOUT_MS } from '../../config/index.js';
import { ServiceUnavailableError, GatewayTimeoutError } from '../../errors/index.js';
import logger from '../../logging/logger.js';

/**
 * Tracks whether the current async context is already executing an engine task.
 * Module-level on purpose: there is exactly one engine, so "am I inside it?"
 * is a process-wide question, not a per-queue-instance one.
 */
const engineContext = new AsyncLocalStorage();

/**
 * Races a task against a caller-side timeout.
 *
 * IMPORTANT: the timeout does NOT cancel the underlying engine call — there is
 * no cancellation primitive in `@actual-app/api`. The caller is rejected with a
 * 504 while the queue slot stays held until the engine call actually settles;
 * releasing the slot early would let the next task run concurrently with it.
 */
const withTimeout = (task, label, timeoutMs) => {
  if (!timeoutMs || timeoutMs <= 0) return task;

  let timer;
  const expiry = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      logger.error('[Actual] Engine operation timed out', { label, timeoutMs });
      reject(new GatewayTimeoutError(`Engine operation "${label}" timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([task, expiry]).finally(() => clearTimeout(timer));
};

/**
 * Builds an isolated queue instance. The module-level default below is the one
 * production uses; the factory exists so tests can build independent queues.
 */
export const createEngineQueue = ({
  maxDepth = ACTUAL_QUEUE_MAX_DEPTH,
  timeoutMs = ACTUAL_OP_TIMEOUT_MS,
} = {}) => {
  let tail = Promise.resolve();
  let depth = 0;

  const getQueueDepth = () => depth;

  const enqueue = (label, fn) => {
    depth += 1;

    const settled = tail.then(() => engineContext.run({ label }, () => fn()));
    // The chain must survive a rejected task, so swallow it here only; the
    // caller still receives the rejection through `tracked`.
    tail = settled.catch(() => undefined);

    const tracked = settled.finally(() => {
      depth -= 1;
    });

    return withTimeout(tracked, label, timeoutMs);
  };

  const withEngine = (label, fn) => {
    if (engineContext.getStore()) {
      // Already inside an engine task: run inline, never enqueue.
      return (async () => fn())();
    }

    if (depth >= maxDepth) {
      logger.error('[Actual] Engine queue is full, rejecting operation', { label, depth, maxDepth });
      return Promise.reject(
        new ServiceUnavailableError(
          `Actual engine queue is full (${depth}/${maxDepth} pending operations). Try again shortly.`
        )
      );
    }

    return enqueue(label, fn);
  };

  return { withEngine, withEngineExclusive: withEngine, getQueueDepth };
};

const defaultQueue = createEngineQueue();

/** Enqueues a single engine operation behind every earlier one. */
export const withEngine = (label, fn) => defaultQueue.withEngine(label, fn);

/**
 * Alias of `withEngine`, kept as a distinct name so batch operations
 * (which must own the engine for their whole span) read as intentional.
 */
export const withEngineExclusive = withEngine;

/** Pending engine operations, queued plus running. Used by metrics and health. */
export const getQueueDepth = () => defaultQueue.getQueueDepth();
