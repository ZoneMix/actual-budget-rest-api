/**
 * GET /v1/audit/changes.
 *
 * The suite drives the real app against a budget fixture written where the
 * SDK would keep it (DATA_DIR/<dir> with groupId = ACTUAL_SYNC_ID). The engine
 * itself is the jest mock, so any SDK call besides the lifecycle and sync
 * would show up as a write path.
 */

import fs from 'fs';
import request from 'supertest';
import { buildTestApp, bearer } from '../helpers/app.js';
import { signTestToken } from '../helpers/token.js';
import { createBudgetFixture, hlc } from '../helpers/auditFixture.js';
import actualApi, { __reset } from '../mocks/actual-api.js';
import { createAuditTokenAuth } from '../../src/auth/auditToken.js';
import { localDate } from '../../src/services/audit/window.js';

const AUDIT_TOKEN = process.env.LEDGER_AUDIT_TOKEN;
const PHONE = '2c3d4e5f60718293';
const ENGINE_CALLS_ALLOWED = new Set(['init', 'shutdown', 'downloadBudget', 'sync', 'q']);
const NOW = new Date().toISOString();

let fixtureDir;

beforeAll(() => {
  ({ dir: fixtureDir } = createBudgetFixture(process.env.DATA_DIR, {
    groupId: process.env.ACTUAL_SYNC_ID,
    name: 'Audit-Route-Fixture',
    ownClientId: '3d4e5f60718293a4',
    messages: [
      [hlc('2026-10-18T20:00:00.000Z', PHONE), 'transactions', 'txn-1', 'amount', -1000],
      [hlc('2026-10-19T12:00:00.000Z', PHONE), 'transactions', 'txn-1', 'amount', -1250],
      [hlc('2026-10-19T13:00:00.000Z', PHONE), 'transactions', 'txn-1', 'notes', `env ${process.env.JWT_SECRET}`],
      [hlc(NOW, PHONE), 'payees', 'payee-1', 'name', 'Today Payee'],
    ],
  }));
});

afterAll(() => {
  fs.rmSync(fixtureDir, { recursive: true, force: true });
});

const engineCallsBeyondReads = () =>
  Object.entries(actualApi)
    .filter(([name, fn]) => !ENGINE_CALLS_ALLOWED.has(name) && fn?.mock?.calls?.length > 0)
    .map(([name]) => name);

describe('GET /v1/audit/changes', () => {
  let app;

  beforeEach(() => {
    __reset();
    app = buildTestApp();
  });

  it('returns 401 without a token and never reaches the engine', async () => {
    const res = await request(app).get('/v1/audit/changes');

    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toBe('Bearer realm="audit"');
    expect(actualApi.init).not.toHaveBeenCalled();
  });

  it('refuses a valid JWT: only the audit token opens this route', async () => {
    const res = await request(app).get('/v1/audit/changes').set(bearer(signTestToken({ scopes: 'api,admin' })));
    expect(res.status).toBe(401);
  });

  it('refuses a wrong token', async () => {
    const res = await request(app).get('/v1/audit/changes').set(bearer(`${AUDIT_TOKEN}x`));
    expect(res.status).toBe(401);
  });

  it('returns the Chicago day with old and new values, read-only', async () => {
    const res = await request(app).get('/v1/audit/changes?date=2026-10-19').set(bearer(AUDIT_TOKEN));

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({
      success: true,
      date: '2026-10-19',
      timeZone: 'America/Chicago',
      window: { start: '2026-10-19T05:00:00.000Z', end: '2026-10-20T05:00:00.000Z' },
      total: 2,
      returned: 2,
      truncated: false,
      summary: { byTable: { transactions: 2 } },
    });
    expect(res.body.changes[0]).toMatchObject({
      table: 'transactions',
      rowId: 'txn-1',
      column: 'amount',
      oldValue: -1000,
      newValue: -1250,
      clientId: PHONE,
    });
    expect(engineCallsBeyondReads()).toEqual([]);
  });

  it('never returns an env value, even one stored in the budget', async () => {
    const res = await request(app).get('/v1/audit/changes?date=2026-10-19').set(bearer(AUDIT_TOKEN));

    expect(res.body.changes[1]).toMatchObject({ newValue: '[redacted]', redacted: true });
    const body = JSON.stringify(res.body);
    ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'SESSION_SECRET', 'ADMIN_PASSWORD', 'LEDGER_AUDIT_TOKEN']
      .forEach((key) => expect(body).not.toContain(process.env[key]));
  });

  it('defaults to today in America/Chicago', async () => {
    const res = await request(app).get('/v1/audit/changes').set(bearer(AUDIT_TOKEN));

    expect(res.status).toBe(200);
    expect(res.body.date).toBe(localDate(new Date(), 'America/Chicago'));
    expect(res.body.changes.map((change) => change.newValue)).toContain('Today Payee');
  });

  it('pages with limit and offset', async () => {
    const res = await request(app).get('/v1/audit/changes?date=2026-10-19&limit=1&offset=1').set(bearer(AUDIT_TOKEN));

    expect(res.body).toMatchObject({ total: 2, returned: 1, offset: 1, limit: 1, truncated: false });
  });

  it.each([
    'date=2026-02-30',
    'date=2026-1-9',
    'date=today',
    'limit=0',
    'limit=999999',
    'offset=-1',
    'table=transactions',
  ])('rejects ?%s with 400', async (query) => {
    const res = await request(app).get(`/v1/audit/changes?${query}`).set(bearer(AUDIT_TOKEN));
    expect(res.status).toBe(400);
  });

  it.each(['post', 'put', 'patch', 'delete'])('answers %s with 405 and no write', async (method) => {
    const res = await request(app)[method]('/v1/audit/changes').set(bearer(AUDIT_TOKEN));

    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe('GET, HEAD');
    expect(engineCallsBeyondReads()).toEqual([]);
  });
});

describe('createAuditTokenAuth', () => {
  it('disables the route with 503 when no token is configured', () => {
    const middleware = createAuditTokenAuth(null);
    const req = { get: () => `Bearer ${AUDIT_TOKEN}` };
    expect(() => middleware(req, {}, () => {})).toThrow(expect.objectContaining({ status: 503 }));
  });

  it('rejects a header that is not a Bearer token68', () => {
    const middleware = createAuditTokenAuth(AUDIT_TOKEN);
    const res = { set: jest.fn() };
    const req = { get: () => `Basic ${AUDIT_TOKEN}`, id: 'r1', ip: '127.0.0.1' };
    expect(() => middleware(req, res, () => {})).toThrow(expect.objectContaining({ status: 401 }));
  });
});
