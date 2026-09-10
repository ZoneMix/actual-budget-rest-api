/**
 * System endpoints: GET /v2/server/version and POST /v2/sync.
 *
 * `getServerVersion()` is the one SDK call with a union return type
 * (methods.d.ts:126-132): `{ version }` on success, `{ error: 'no-server' }` or
 * `{ error: 'network-failure' }` when the Actual server cannot be reached.
 * The failure arm is an upstream problem, not a client one, so it answers 502.
 *
 * `POST /v2/sync` runs through `runWithApi(..., { mode: 'read', force: true })`.
 * The forced pre-read sync IS the sync — the engine is asked exactly once, not
 * twice.
 */

import request from 'supertest';
import { buildTestApp, bearer } from '../helpers/app.js';
import { signTestToken } from '../helpers/token.js';
import actualApi, { __reset } from '../mocks/actual-api.js';

describe('GET /v2/server/version', () => {
  let app;
  let token;

  beforeEach(() => {
    __reset();
    app = buildTestApp();
    token = signTestToken();
  });

  it('returns 401 without a token and never reaches the engine', async () => {
    const res = await request(app).get('/v2/server/version');

    expect(res.status).toBe(401);
    expect(actualApi.getServerVersion).not.toHaveBeenCalled();
  });

  it('returns the version the server reported', async () => {
    actualApi.getServerVersion.mockResolvedValueOnce({ version: '25.9.0' });

    const res = await request(app).get('/v2/server/version').set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, version: '25.9.0' });
    expect(actualApi.getServerVersion).toHaveBeenCalledWith();
  });

  it('answers 502 when the engine reports no-server', async () => {
    actualApi.getServerVersion.mockResolvedValueOnce({ error: 'no-server' });

    const res = await request(app).get('/v2/server/version').set(bearer(token));

    expect(res.status).toBe(502);
    expect(res.body.error).toContain('no-server');
  });

  it('answers 502 when the engine reports network-failure', async () => {
    actualApi.getServerVersion.mockResolvedValueOnce({ error: 'network-failure' });

    const res = await request(app).get('/v2/server/version').set(bearer(token));

    expect(res.status).toBe(502);
    expect(res.body.error).toContain('network-failure');
  });
});

describe('POST /v2/sync', () => {
  let app;
  let token;

  beforeEach(() => {
    __reset();
    app = buildTestApp();
    token = signTestToken();
  });

  it('returns 401 without a token and never reaches the engine', async () => {
    const res = await request(app).post('/v2/sync');

    expect(res.status).toBe(401);
    expect(actualApi.sync).not.toHaveBeenCalled();
  });

  it('syncs once and reports when it happened', async () => {
    const res = await request(app).post('/v2/sync').set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.syncedAt).toBe('string');
    expect(new Date(res.body.syncedAt).toISOString()).toBe(res.body.syncedAt);
    expect(actualApi.sync).toHaveBeenCalledTimes(1);
  });

  it('surfaces a failing sync rather than reporting success', async () => {
    actualApi.sync.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

    const res = await request(app).post('/v2/sync').set(bearer(token));

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.body.success).toBeUndefined();
  });
});
