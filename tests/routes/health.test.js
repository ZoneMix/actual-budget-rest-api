/**
 * GET /v2/health
 */

import request from 'supertest';
import { buildTestApp } from '../helpers/app.js';
import { syncPolicy } from '../../src/services/actualApi.js';

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
