/**
 * Scope enforcement as the routers actually mount it.
 *
 * The unit tests in tests/auth/permissions.test.js prove the decision; this
 * proves the wiring — that `requireScopeByMethod()` really sits behind every
 * /v2 data router (including the transactions router nested inside accounts,
 * which inherits the parent's middleware), and that a denial stops the request
 * before it reaches the Actual engine.
 *
 * Runs in `enforce` mode: `warn` is the shipped default precisely so nothing
 * 403s, which would make an end-to-end assertion vacuous. The mode is read per
 * request, so setting it here is enough — no module re-import.
 */

import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';
import { buildTestApp, bearer } from '../helpers/app.js';
import { signTestToken } from '../helpers/token.js';
import actualApi, { __reset } from '../mocks/actual-api.js';

const ORIGINAL_MODE = process.env.AUTH_SCOPE_ENFORCEMENT;
const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

let app;
let readToken;
let legacyToken;
let adminToken;

beforeEach(() => {
  process.env.AUTH_SCOPE_ENFORCEMENT = 'enforce';
  __reset();
  app = buildTestApp();
  readToken = signTestToken({ scopes: 'read' });
  legacyToken = signTestToken({ scopes: 'api' });
  adminToken = signTestToken({ scopes: 'api,admin', role: 'admin' });
});

afterAll(() => {
  if (ORIGINAL_MODE === undefined) {
    delete process.env.AUTH_SCOPE_ENFORCEMENT;
    return;
  }
  process.env.AUTH_SCOPE_ENFORCEMENT = ORIGINAL_MODE;
});

describe('a read-only token', () => {
  it('reads /v2/accounts', async () => {
    actualApi.getAccounts.mockResolvedValueOnce([{ id: 'acc-1', name: 'Checking' }]);

    const res = await request(app).get('/v2/accounts').set(bearer(readToken));

    expect(res.status).toBe(200);
  });

  it('is refused a write and never reaches the engine', async () => {
    const res = await request(app)
      .post('/v2/accounts')
      .set(bearer(readToken))
      .send({ account: { name: 'Test' }, initialBalance: 0 });

    expect(res.status).toBe(403);
    expect(actualApi.createAccount).not.toHaveBeenCalled();
  });

  it('is refused a write on a nested transactions route', async () => {
    const res = await request(app)
      .post(`/v2/accounts/${ACCOUNT_ID}/transactions`)
      .set(bearer(readToken))
      .send({ transactions: [{ date: '2026-01-01', amount: 100 }] });

    expect(res.status).toBe(403);
    expect(actualApi.addTransactions).not.toHaveBeenCalled();
  });

  it('is refused a write on the other /v2 data routers', async () => {
    const payloads = [
      ['/v2/categories', { category: { name: 'Groceries', group_id: 'grp-1' } }],
      ['/v2/payees', { payee: { name: 'Store' } }],
      ['/v2/rules', { rule: {} }],
    ];

    for (const [path, body] of payloads) {
      const res = await request(app).post(path).set(bearer(readToken)).send(body);
      expect(res.status).toBe(403);
    }
  });
});

describe('a legacy api token', () => {
  it('still reads and writes', async () => {
    actualApi.getAccounts.mockResolvedValueOnce([]);
    actualApi.createAccount.mockResolvedValueOnce('acc-new');

    const read = await request(app).get('/v2/accounts').set(bearer(legacyToken));
    const write = await request(app)
      .post('/v2/accounts')
      .set(bearer(legacyToken))
      .send({ account: { name: 'Test' }, initialBalance: 0 });

    expect(read.status).toBe(200);
    expect(write.status).toBe(201);
  });

  it('reads a nested transactions route', async () => {
    // The nested router resolves the account first, so it has to exist.
    actualApi.getAccounts.mockResolvedValue([{ id: ACCOUNT_ID, name: 'Checking' }]);
    actualApi.getTransactions.mockResolvedValueOnce([]);

    const res = await request(app).get(`/v2/accounts/${ACCOUNT_ID}/transactions`).set(bearer(legacyToken));

    expect(res.status).toBe(200);
  });
});

describe('an admin token', () => {
  it('reads and writes', async () => {
    actualApi.getAccounts.mockResolvedValueOnce([]);
    actualApi.createAccount.mockResolvedValueOnce('acc-new');

    const read = await request(app).get('/v2/accounts').set(bearer(adminToken));
    const write = await request(app)
      .post('/v2/accounts')
      .set(bearer(adminToken))
      .send({ account: { name: 'Test' }, initialBalance: 0 });

    expect(read.status).toBe(200);
    expect(write.status).toBe(201);
  });
});

describe('POST /v2/metrics/reset', () => {
  it('requires a token', async () => {
    const res = await request(app).post('/v2/metrics/reset');

    expect(res.status).toBe(401);
  });

  it('refuses a non-admin token', async () => {
    const res = await request(app).post('/v2/metrics/reset').set(bearer(legacyToken));

    expect(res.status).toBe(403);
  });

  it('accepts an admin token', async () => {
    const res = await request(app).post('/v2/metrics/reset').set(bearer(adminToken));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe('POST /v2/metrics/reset under the shipped warn default', () => {
  // Resetting metrics destroys observability data, so it is a role gate rather
  // than part of the scope rollout: it must refuse a non-admin even in `warn`,
  // which is the mode every deployment starts in.
  beforeEach(() => {
    process.env.AUTH_SCOPE_ENFORCEMENT = 'warn';
  });

  it('still refuses a non-admin token', async () => {
    const res = await request(app).post('/v2/metrics/reset').set(bearer(legacyToken));

    expect(res.status).toBe(403);
  });

  it('still accepts an admin token', async () => {
    const res = await request(app).post('/v2/metrics/reset').set(bearer(adminToken));

    expect(res.status).toBe(200);
  });
});
