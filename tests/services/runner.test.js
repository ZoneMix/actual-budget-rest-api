/**
 * runWithApi: the one path every domain function takes into the engine.
 *
 * Reads sync only when the policy says the local copy may be behind; writes
 * always sync afterwards, absorbing a post-write sync failure so a completed
 * mutation is never reported as an error. A write syncs first only when it
 * asks to with `syncBefore`, which read-modify-write operations need.
 */

import { jest } from '@jest/globals';
import actualApi, { __reset } from '../mocks/actual-api.js';
import { runWithApi } from '../../src/services/actual/runner.js';
import { getActualApi } from '../../src/services/actual/client.js';
import { syncPolicy } from '../../src/services/actual/syncPolicy.js';
import { register } from '../../src/middleware/metrics.js';

const metricTotal = async (name) => {
  const metric = register.getSingleMetric(name);
  if (!metric) return null;
  const { values } = await metric.get();
  return values.reduce((sum, entry) => sum + entry.value, 0);
};

describe('runWithApi', () => {
  beforeEach(async () => {
    __reset();
    // Force the lazy init once, then clear the init/downloadBudget call records
    // so each test counts only the calls it makes itself.
    await getActualApi();
    __reset();
    syncPolicy.forceStale();
  });

  describe('mode: read', () => {
    it('syncs when the policy is stale and skips the sync while it is fresh', async () => {
      const first = await runWithApi('read-1', async () => 'first', { mode: 'read' });
      expect(first).toBe('first');
      expect(actualApi.sync).toHaveBeenCalledTimes(1);

      const second = await runWithApi('read-2', async () => 'second', { mode: 'read' });
      expect(second).toBe('second');
      expect(actualApi.sync).toHaveBeenCalledTimes(1);
    });

    it('syncs when force is set even though the policy is fresh', async () => {
      await runWithApi('read-1', async () => 'first', { mode: 'read' });
      expect(actualApi.sync).toHaveBeenCalledTimes(1);

      await runWithApi('read-2', async () => 'second', { mode: 'read', force: true });
      expect(actualApi.sync).toHaveBeenCalledTimes(2);
    });

    it('re-downloads the budget once and retries when sync fails on getPrefs', async () => {
      actualApi.sync.mockRejectedValueOnce(
        new Error('Cannot destructure property getPrefs of null')
      );

      const result = await runWithApi('read-recover', async () => 'recovered', { mode: 'read' });

      expect(result).toBe('recovered');
      expect(actualApi.downloadBudget).toHaveBeenCalledTimes(1);
      expect(actualApi.downloadBudget).toHaveBeenCalledWith('test-sync-id');
      expect(actualApi.sync).toHaveBeenCalledTimes(2);
    });

    it('throws a wrapped error when a pre-read sync fails for any other reason', async () => {
      actualApi.sync.mockRejectedValueOnce(new Error('server unreachable'));

      await expect(runWithApi('read-fail', async () => 'never', { mode: 'read' })).rejects.toThrow(
        /Failed to sync with Actual Budget server: server unreachable/
      );
      expect(actualApi.downloadBudget).not.toHaveBeenCalled();
    });
  });

  describe('mode: write', () => {
    it('runs the operation first, then syncs, and marks the policy fresh', async () => {
      const operation = jest.fn(async () => 'written');

      const result = await runWithApi('write-1', operation, { mode: 'write' });

      expect(result).toBe('written');
      expect(actualApi.sync).toHaveBeenCalledTimes(1);
      expect(operation.mock.invocationCallOrder[0]).toBeLessThan(
        actualApi.sync.mock.invocationCallOrder[0]
      );
      expect(syncPolicy.shouldSyncBefore()).toBe(false);
    });

    // A read-modify-write has to read a copy that is level with the server, or
    // the post-write sync pushes a merge built on stale data back upstream.
    describe('syncBefore', () => {
      it('syncs before the operation and again after it', async () => {
        const operation = jest.fn(async () => 'written');

        await runWithApi('write-rmw', operation, { mode: 'write', syncBefore: true });

        expect(actualApi.sync).toHaveBeenCalledTimes(2);
        expect(actualApi.sync.mock.invocationCallOrder[0]).toBeLessThan(
          operation.mock.invocationCallOrder[0]
        );
        expect(operation.mock.invocationCallOrder[0]).toBeLessThan(
          actualApi.sync.mock.invocationCallOrder[1]
        );
      });

      it('syncs first even when the policy says the copy is fresh', async () => {
        await runWithApi('write-warm', async () => 'ok', { mode: 'write' });
        expect(syncPolicy.shouldSyncBefore()).toBe(false);
        actualApi.sync.mockClear();

        await runWithApi('write-rmw', async () => 'ok', { mode: 'write', syncBefore: true });

        expect(actualApi.sync).toHaveBeenCalledTimes(2);
      });

      it('never runs the operation when the pre-write sync fails', async () => {
        actualApi.sync.mockRejectedValueOnce(new Error('server unreachable'));
        const operation = jest.fn(async () => 'never');

        await expect(
          runWithApi('write-sync-fail', operation, { mode: 'write', syncBefore: true })
        ).rejects.toThrow(/Failed to sync with Actual Budget server: server unreachable/);

        expect(operation).not.toHaveBeenCalled();
      });

      it('leaves an ordinary write syncing only afterwards', async () => {
        const operation = jest.fn(async () => 'written');

        await runWithApi('write-plain', operation, { mode: 'write' });

        expect(actualApi.sync).toHaveBeenCalledTimes(1);
        expect(operation.mock.invocationCallOrder[0]).toBeLessThan(
          actualApi.sync.mock.invocationCallOrder[0]
        );
      });
    });

    it('absorbs a post-write sync failure: no throw, same result, policy left stale', async () => {
      const failuresBefore = await metricTotal('actual_engine_sync_failures_total');
      actualApi.sync.mockRejectedValueOnce(new Error('post-write sync exploded'));

      const result = await runWithApi('write-fail', async () => ({ id: 'txn-1' }), { mode: 'write' });

      expect(result).toEqual({ id: 'txn-1' });
      expect(syncPolicy.shouldSyncBefore()).toBe(true);
      expect(syncPolicy.lastSyncError()).toMatchObject({ message: 'post-write sync exploded' });
      expect(await metricTotal('actual_engine_sync_failures_total')).toBe(failuresBefore + 1);
    });
  });

  describe('metrics', () => {
    const durationCount = async (label, outcome) => {
      const durations = register.getSingleMetric('actual_engine_op_duration_seconds');
      expect(durations).toBeDefined();

      const { values } = await durations.get();
      return values.find(
        (entry) =>
          entry.metricName === 'actual_engine_op_duration_seconds_count' &&
          entry.labels.label === label &&
          entry.labels.outcome === outcome
      )?.value;
    };

    it('observes the operation duration with its label, mode and outcome', async () => {
      await runWithApi('metered-op', async () => 'ok', { mode: 'read' });

      const durations = register.getSingleMetric('actual_engine_op_duration_seconds');
      const { values } = await durations.get();
      const counted = values.find(
        (entry) =>
          entry.metricName === 'actual_engine_op_duration_seconds_count' &&
          entry.labels.label === 'metered-op' &&
          entry.labels.mode === 'read' &&
          entry.labels.outcome === 'success'
      );
      expect(counted?.value).toBe(1);
    });

    it('still observes the duration when the operation throws, labelled outcome=error', async () => {
      await expect(
        runWithApi(
          'failing-op',
          async () => {
            throw new Error('engine exploded');
          },
          { mode: 'read' }
        )
      ).rejects.toThrow('engine exploded');

      expect(await durationCount('failing-op', 'error')).toBe(1);
      expect(await durationCount('failing-op', 'success')).toBeUndefined();
    });

    it('observes a failed pre-read sync as an error too', async () => {
      actualApi.sync.mockRejectedValueOnce(new Error('server unreachable'));

      await expect(
        runWithApi('sync-failing-op', async () => 'never', { mode: 'read' })
      ).rejects.toThrow(/Failed to sync with Actual Budget server/);

      expect(await durationCount('sync-failing-op', 'error')).toBe(1);
    });

    it('reports the current queue depth as a gauge', async () => {
      await runWithApi('gauge-op', async () => 'ok', { mode: 'read' });

      const gauge = register.getSingleMetric('actual_engine_queue_depth');
      expect(gauge).toBeDefined();

      const { values } = await gauge.get();
      expect(values[0].value).toBe(1);
    });
  });
});
