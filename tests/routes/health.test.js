/**
 * GET /v2/health
 */

import request from 'supertest';
import { buildTestApp } from '../helpers/app.js';
import { syncPolicy } from '../../src/services/actualApi.js';
import { shapeSyncError } from '../../src/routes/health.js';

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
});
