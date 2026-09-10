/**
 * GET /v2/health before the engine has ever initialised.
 *
 * Its own file on purpose: "the engine was never initialised" is module state
 * in src/services/actual/client.js, and any earlier test in the same file that
 * touched the engine would initialise it and hide the regression.
 *
 * The probe used to call `getActualApi()`, which lazily runs `init()` plus
 * `downloadBudget()`. /v2/health has no auth and the Dockerfile HEALTHCHECK
 * polls it every 30 s, so an unauthenticated caller could drive engine startup
 * and a download of the whole budget file. A health check observes; it never
 * drives.
 */

import request from 'supertest';
import { buildTestApp } from '../helpers/app.js';
import actualApi, { __reset } from '../mocks/actual-api.js';

describe('GET /v2/health with the engine not initialised', () => {
  beforeEach(() => {
    __reset();
  });

  it('answers 503 with not-initialised and never calls init or downloadBudget', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/v2/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.checks.actualApi.status).toBe('not-initialised');
    expect(actualApi.init).not.toHaveBeenCalled();
    expect(actualApi.downloadBudget).not.toHaveBeenCalled();
    expect(actualApi.getAccounts).not.toHaveBeenCalled();
  });

  it('still reports the operational engine fields', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/v2/health');

    expect(res.body.checks.actualApi).toHaveProperty('queueDepth', 0);
    expect(res.body.checks.actualApi).toHaveProperty('lastSyncAt');
    expect(res.body.checks.actualApi).toHaveProperty('lastSyncError');
  });

  it('reports the database check independently', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/v2/health');

    expect(res.body.checks.database.status).toBe('ok');
  });
});
