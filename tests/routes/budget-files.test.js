/**
 * /v2/budget/* — budget file listing, loading and export.
 *
 * Loading swaps the open budget for the whole process and exporting hands out
 * the entire ledger, so both are admin-only through `requireAdminRole()` rather
 * than `requireScope(SCOPES.ADMIN)`: the role gate enforces in every
 * AUTH_SCOPE_ENFORCEMENT mode, including the shipped `warn` default where a
 * scope denial only logs.
 *
 * `/v2/budget` (singular) is a separate mount from `/v2/budgets` (the budget
 * month endpoints).
 */

import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';
import { buildTestApp, bearer } from '../helpers/app.js';
import { signTestToken } from '../helpers/token.js';
import actualApi, { __reset } from '../mocks/actual-api.js';

const ORIGINAL_MODE = process.env.AUTH_SCOPE_ENFORCEMENT;
const BUDGET_ID = 'c3d4e5f6-9999-40a1-b2c3-d4e5f6708192';
const ZIP_BYTES = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x0a, 0x00, 0x00, 0x00]);

let app;
let adminToken;
let userToken;

beforeEach(() => {
  __reset();
  app = buildTestApp();
  adminToken = signTestToken({ scopes: 'api,admin', role: 'admin' });
  userToken = signTestToken({ scopes: 'api', role: 'user' });
});

afterAll(() => {
  if (ORIGINAL_MODE === undefined) {
    delete process.env.AUTH_SCOPE_ENFORCEMENT;
    return;
  }
  process.env.AUTH_SCOPE_ENFORCEMENT = ORIGINAL_MODE;
});

describe('GET /v2/budget/files', () => {
  it('returns 401 without a token and never reaches the engine', async () => {
    const res = await request(app).get('/v2/budget/files');

    expect(res.status).toBe(401);
    expect(actualApi.getBudgets).not.toHaveBeenCalled();
  });

  it('lists the budget files the engine knows about', async () => {
    const files = [
      { id: BUDGET_ID, cloudFileId: 'cloud-1', groupId: 'grp-1', name: 'Belisario Ledger', state: 'remote' },
    ];
    actualApi.getBudgets.mockResolvedValueOnce(files);

    const res = await request(app).get('/v2/budget/files').set(bearer(userToken));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, files });
    expect(actualApi.getBudgets).toHaveBeenCalledWith();
  });
});

describe('POST /v2/budget/load', () => {
  it('returns 401 without a token and never reaches the engine', async () => {
    const res = await request(app).post('/v2/budget/load').send({ budgetId: BUDGET_ID });

    expect(res.status).toBe(401);
    expect(actualApi.loadBudget).not.toHaveBeenCalled();
  });

  it('refuses a non-admin token under the shipped warn default', async () => {
    process.env.AUTH_SCOPE_ENFORCEMENT = 'warn';

    const res = await request(app)
      .post('/v2/budget/load')
      .set(bearer(userToken))
      .send({ budgetId: BUDGET_ID });

    expect(res.status).toBe(403);
    expect(actualApi.loadBudget).not.toHaveBeenCalled();
  });

  it('refuses a non-admin token under enforce', async () => {
    process.env.AUTH_SCOPE_ENFORCEMENT = 'enforce';

    const res = await request(app)
      .post('/v2/budget/load')
      .set(bearer(userToken))
      .send({ budgetId: BUDGET_ID });

    expect(res.status).toBe(403);
    expect(actualApi.loadBudget).not.toHaveBeenCalled();
  });

  it('loads the budget for an admin token', async () => {
    process.env.AUTH_SCOPE_ENFORCEMENT = 'enforce';

    const res = await request(app)
      .post('/v2/budget/load')
      .set(bearer(adminToken))
      .send({ budgetId: BUDGET_ID });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, budgetId: BUDGET_ID });
    expect(actualApi.loadBudget).toHaveBeenCalledWith(BUDGET_ID);
  });

  it('rejects a body with no budgetId', async () => {
    process.env.AUTH_SCOPE_ENFORCEMENT = 'enforce';

    const res = await request(app).post('/v2/budget/load').set(bearer(adminToken)).send({});

    expect(res.status).toBe(400);
    expect(actualApi.loadBudget).not.toHaveBeenCalled();
  });
});

describe('POST /v2/budget/export', () => {
  it('returns 401 without a token and never reaches the engine', async () => {
    const res = await request(app).post('/v2/budget/export');

    expect(res.status).toBe(401);
    expect(actualApi.exportBudget).not.toHaveBeenCalled();
  });

  it('refuses a non-admin token under the shipped warn default', async () => {
    process.env.AUTH_SCOPE_ENFORCEMENT = 'warn';

    const res = await request(app).post('/v2/budget/export').set(bearer(userToken));

    expect(res.status).toBe(403);
    expect(actualApi.exportBudget).not.toHaveBeenCalled();
  });

  // `Buffer.from(undefined)` throws ERR_INVALID_ARG_TYPE, which reaches the
  // client as an opaque 500 about argument types; a zero-length result is
  // worse, arriving as a 200 with an empty zip that looks like a successful
  // backup. Neither is an export, so both must fail loudly and on purpose.
  it('fails explicitly when the engine returns nothing', async () => {
    process.env.AUTH_SCOPE_ENFORCEMENT = 'enforce';
    actualApi.exportBudget.mockResolvedValueOnce(undefined);

    const res = await request(app).post('/v2/budget/export').set(bearer(adminToken));

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/export/i);
    expect(res.body.error).not.toMatch(/ERR_INVALID_ARG_TYPE|first argument/i);
  });

  it('fails explicitly rather than returning an empty zip', async () => {
    process.env.AUTH_SCOPE_ENFORCEMENT = 'enforce';
    actualApi.exportBudget.mockResolvedValueOnce(new Uint8Array(0));

    const res = await request(app).post('/v2/budget/export').set(bearer(adminToken));

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/export/i);
    expect(res.headers['content-type']).not.toBe('application/zip');
  });

  it('streams the zip bytes with download headers, never base64 in JSON', async () => {
    process.env.AUTH_SCOPE_ENFORCEMENT = 'enforce';
    actualApi.exportBudget.mockResolvedValueOnce(ZIP_BYTES);
    const today = new Date().toISOString().slice(0, 10);

    const res = await request(app)
      .post('/v2/budget/export')
      .set(bearer(adminToken))
      .responseType('blob');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="actual-budget-${today}.zip"`
    );
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(Buffer.from(res.body).equals(Buffer.from(ZIP_BYTES))).toBe(true);
    expect(actualApi.exportBudget).toHaveBeenCalledWith();
  });
});
