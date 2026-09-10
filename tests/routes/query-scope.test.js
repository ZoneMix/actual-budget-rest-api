/**
 * POST /v2/query is a READ over POST.
 *
 * `requireScopeByMethod()` classifies anything that is not GET/HEAD/OPTIONS as
 * a write, so the ActualQL endpoint demanded the write scope for what is a
 * read-only query — the table whitelist and `secureQueryMiddleware` make sure
 * of that. A read-only token must be able to query.
 *
 * Runs under `enforce`: in the shipped `warn` default a scope denial only logs,
 * which would make the assertion vacuous.
 */

import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';
import { buildTestApp, bearer } from '../helpers/app.js';
import { signTestToken } from '../helpers/token.js';
import actualApi, { __reset } from '../mocks/actual-api.js';

const ORIGINAL_MODE = process.env.AUTH_SCOPE_ENFORCEMENT;

let app;

beforeEach(() => {
  process.env.AUTH_SCOPE_ENFORCEMENT = 'enforce';
  __reset();
  app = buildTestApp();
});

afterAll(() => {
  if (ORIGINAL_MODE === undefined) {
    delete process.env.AUTH_SCOPE_ENFORCEMENT;
    return;
  }
  process.env.AUTH_SCOPE_ENFORCEMENT = ORIGINAL_MODE;
});

describe('POST /v2/query under enforce', () => {
  it('accepts a read-only token', async () => {
    actualApi.aqlQuery.mockResolvedValueOnce({ data: [], dependencies: [] });

    const res = await request(app)
      .post('/v2/query')
      .set(bearer(signTestToken({ scopes: 'read' })))
      .send({ query: { table: 'transactions' } });

    expect(res.status).toBe(200);
    expect(actualApi.aqlQuery).toHaveBeenCalled();
  });

  it('still accepts a write-scoped token', async () => {
    actualApi.aqlQuery.mockResolvedValueOnce({ data: [], dependencies: [] });

    const res = await request(app)
      .post('/v2/query')
      .set(bearer(signTestToken({ scopes: 'write' })))
      .send({ query: { table: 'transactions' } });

    expect(res.status).toBe(200);
  });

  it('still accepts a legacy api token', async () => {
    actualApi.aqlQuery.mockResolvedValueOnce({ data: [], dependencies: [] });

    const res = await request(app)
      .post('/v2/query')
      .set(bearer(signTestToken({ scopes: 'api' })))
      .send({ query: { table: 'transactions' } });

    expect(res.status).toBe(200);
  });

  it('still requires a token', async () => {
    const res = await request(app).post('/v2/query').send({ query: { table: 'transactions' } });

    expect(res.status).toBe(401);
    expect(actualApi.aqlQuery).not.toHaveBeenCalled();
  });
});
