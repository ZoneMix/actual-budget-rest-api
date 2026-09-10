/**
 * Sync policy: decides whether a read needs a fresh `api.sync()` round trip,
 * so reads stop paying for one on every single request.
 */

import { createSyncPolicy } from '../../src/services/actual/syncPolicy.js';

const MIN_INTERVAL_MS = 5000;

/** Injectable clock so the tests never sleep. */
const fakeClock = (start = 1_700_000_000_000) => {
  let current = start;
  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
  };
};

const buildPolicy = () => {
  const clock = fakeClock();
  return { clock, policy: createSyncPolicy({ minIntervalMs: MIN_INTERVAL_MS, now: clock.now }) };
};

describe('createSyncPolicy', () => {
  it('syncs on the first read because nothing has synced yet', () => {
    const { policy } = buildPolicy();

    expect(policy.shouldSyncBefore()).toBe(true);
    expect(policy.lastSyncAt()).toBeNull();
  });

  it('skips the sync while the last one is fresher than the interval', () => {
    const { clock, policy } = buildPolicy();

    policy.markSynced();
    clock.advance(MIN_INTERVAL_MS - 1);

    expect(policy.shouldSyncBefore()).toBe(false);
  });

  it('syncs once the last successful sync is older than the interval', () => {
    const { clock, policy } = buildPolicy();

    policy.markSynced();
    clock.advance(MIN_INTERVAL_MS);

    expect(policy.shouldSyncBefore()).toBe(true);
  });

  it('syncs regardless of the interval once marked stale', () => {
    const { policy } = buildPolicy();

    policy.markSynced();
    expect(policy.shouldSyncBefore()).toBe(false);

    policy.forceStale();
    expect(policy.shouldSyncBefore()).toBe(true);
  });

  it('syncs when force is true even though the last sync is fresh', () => {
    const { policy } = buildPolicy();

    policy.markSynced();

    expect(policy.shouldSyncBefore()).toBe(false);
    expect(policy.shouldSyncBefore({ force: true })).toBe(true);
  });

  it('records the timestamp of the last successful sync from the injected clock', () => {
    const { clock, policy } = buildPolicy();
    const before = clock.now();

    policy.markSynced();

    expect(policy.lastSyncAt()).toBe(before);
  });

  it('remembers the last sync error and clears it on the next success', () => {
    const { policy } = buildPolicy();

    expect(policy.lastSyncError()).toBeNull();

    policy.recordSyncError(new Error('server unreachable'));
    expect(policy.lastSyncError()).toMatchObject({ message: 'server unreachable' });

    policy.markSynced();
    expect(policy.lastSyncError()).toBeNull();
  });
});
