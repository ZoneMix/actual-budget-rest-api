/**
 * GET /v2/health
 */

import request from 'supertest';
import { buildTestApp } from '../helpers/app.js';
import { syncPolicy, getQueueDepth, withEngine } from '../../src/services/actualApi.js';
import { shapeSyncError } from '../../src/routes/health-checks.js';
import actualApi from '../mocks/actual-api.js';

describe('shapeSyncError', () => {
  // The message is the raw error from instance.sync(), so it can name the
  // Actual server's host and port. /v2/health has no auth middleware.
  const failure = {
    message: 'connect ECONNREFUSED 10.42.7.3:5006',
    at: '2026-09-10T12:00:00.000Z',
  };

  it('returns null when nothing has failed', () => {
    expect(shapeSyncError(null, true)).toBeNull();
    expect(shapeSyncError(null, false)).toBeNull();
  });

  it('emits only the timestamp in production, never the raw message', () => {
    const shaped = shapeSyncError(failure, true);

    expect(shaped).toEqual({ at: failure.at });
    expect(shaped.message).toBeUndefined();
    expect(JSON.stringify(shaped)).not.toContain('10.42.7.3');
    expect(JSON.stringify(shaped)).not.toContain('5006');
  });

  it('keeps the message outside production so the failure is debuggable', () => {
    expect(shapeSyncError(failure, false)).toMatchObject({
      message: failure.message,
      at: failure.at,
    });
  });
});

describe('GET /v2/health', () => {
  it('returns 200 with a status field when checks pass', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/v2/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body.checks.database.status).toBe('ok');
    expect(res.body.checks.actualApi.status).toBe('ok');
  });

  it('reports the engine queue depth alongside the actualApi check', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/v2/health');

    expect(res.body.checks.actualApi).toHaveProperty('queueDepth', 0);
    expect(res.body.checks.actualApi).toHaveProperty('lastSyncAt');
    expect(res.body.checks.actualApi).toHaveProperty('lastSyncError');
  });

  it('surfaces the timestamp of the last successful sync', async () => {
    syncPolicy.markSynced();

    const app = buildTestApp();
    const res = await request(app).get('/v2/health');

    expect(typeof res.body.checks.actualApi.lastSyncAt).toBe('number');
    expect(res.body.checks.actualApi.lastSyncError).toBeNull();
  });

  it('surfaces the last sync error so a degraded engine is visible', async () => {
    syncPolicy.recordSyncError(new Error('sync went sideways'));

    const app = buildTestApp();
    const res = await request(app).get('/v2/health');

    expect(res.body.checks.actualApi.lastSyncError).toMatchObject({
      message: 'sync went sideways',
    });
  });

  // The Actual server version answers "which server am I actually talking to",
  // which is the first question when a sync starts failing. It is best-effort:
  // getServerVersion() has its own failure arm, and a health check must not
  // turn that into a 500.
  it('reports the Actual server version alongside the engine state', async () => {
    actualApi.getServerVersion.mockResolvedValueOnce({ version: '25.9.0' });

    const app = buildTestApp();
    const res = await request(app).get('/v2/health');

    expect(res.body.checks.actualApi.serverVersion).toBe('25.9.0');
  });

  it('reports a null server version rather than failing when the server is unreachable', async () => {
    actualApi.getServerVersion.mockResolvedValueOnce({ error: 'network-failure' });

    const app = buildTestApp();
    const res = await request(app).get('/v2/health');

    expect(res.status).toBe(200);
    expect(res.body.checks.actualApi.serverVersion).toBeNull();
  });

  it('reports a null server version when the version call itself throws', async () => {
    actualApi.getServerVersion.mockRejectedValueOnce(new Error('boom'));

    const app = buildTestApp();
    const res = await request(app).get('/v2/health');

    expect(res.status).toBe(200);
    expect(res.body.checks.actualApi.serverVersion).toBeNull();
  });
});

/**
 * A health check must OBSERVE the engine, never drive it.
 *
 * Reading the server version through the queued service layer would take the
 * read path in `runWithApi`, whose pre-read sync calls `syncPolicy.markSynced()`
 * — and `markSynced` clears `lastSyncError`. A polled health check would then
 * erase the very diagnostic it exists to report, and would let an anonymous
 * caller (this endpoint has no auth) push sync traffic at the Actual server and
 * queue behind a long-running export.
 */
describe('GET /v2/health does not drive the engine', () => {
  // A failed sync leaves the policy BOTH stale and carrying the error
  // (runner.js syncAfterWrite calls forceStale() then recordSyncError()), so
  // that is the state to reproduce. With a fresh policy the read path skips its
  // pre-sync and the bug hides.
  beforeEach(() => {
    actualApi.sync.mockClear();
    syncPolicy.forceStale();
  });

  it('never syncs, even when the policy says the local copy is behind', async () => {
    expect(syncPolicy.shouldSyncBefore()).toBe(true);

    const app = buildTestApp();
    await request(app).get('/v2/health');

    expect(actualApi.sync).not.toHaveBeenCalled();
  });

  it('does not clear a recorded sync error, however often it is polled', async () => {
    syncPolicy.recordSyncError(new Error('sync went sideways'));

    const app = buildTestApp();
    const first = await request(app).get('/v2/health');
    const second = await request(app).get('/v2/health');

    expect(first.body.checks.actualApi.lastSyncError).toMatchObject({
      message: 'sync went sideways',
    });
    // The regression this pins: a queued read syncs, markSynced() nulls
    // lastSyncError, and the failure vanishes from monitoring on the next poll.
    expect(second.body.checks.actualApi.lastSyncError).toMatchObject({
      message: 'sync went sideways',
    });
  });

  it('leaves the sync policy exactly as it found it', async () => {
    syncPolicy.recordSyncError(new Error('sync went sideways'));
    const lastSyncAtBefore = syncPolicy.lastSyncAt();

    const app = buildTestApp();
    await request(app).get('/v2/health');

    expect(syncPolicy.shouldSyncBefore()).toBe(true);
    expect(syncPolicy.lastSyncAt()).toBe(lastSyncAtBefore);
    expect(syncPolicy.lastSyncError()).toMatchObject({ message: 'sync went sideways' });
  });

  // /v2/health has no auth. If it entered the queue its latency would be bounded
  // by queue depth plus ACTUAL_OP_TIMEOUT_MS, so one slow export would take the
  // liveness probe down with it. This request must answer while the engine is
  // held by someone else.
  it('answers while the engine queue is held by a long-running operation', async () => {
    let release;
    const blocked = new Promise((resolve) => { release = resolve; });
    const holding = withEngine('test-blocker', () => blocked);

    const app = buildTestApp();
    const res = await request(app).get('/v2/health');

    expect(res.status).toBe(200);
    expect(res.body.checks.actualApi.queueDepth).toBeGreaterThan(0);

    release();
    await holding;
    expect(getQueueDepth()).toBe(0);
  });

  it('still reports the server version it read outside the queue', async () => {
    actualApi.getServerVersion.mockResolvedValueOnce({ version: '25.9.0' });

    const app = buildTestApp();
    const res = await request(app).get('/v2/health');

    expect(res.body.checks.actualApi.serverVersion).toBe('25.9.0');
    expect(actualApi.sync).not.toHaveBeenCalled();
  });
});
