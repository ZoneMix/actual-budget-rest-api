/**
 * Per-router body-size limits.
 *
 * A global `express.json()` mounted in createApp() parses every request first
 * and sets `req._body`, at which point body-parser 2.x bails out of any parser
 * mounted further down the stack (lib/read.js). That silently demoted the
 * 1 mb bulk parser and the 10 kb query parser to whatever MAX_REQUEST_SIZE
 * said, so a documented 500-operation batch (~53 kB of JSON) answered 413.
 *
 * These tests pin the limits at the boundary each router actually promises:
 * bulk routes take 1 mb, ordinary routes take MAX_REQUEST_SIZE, and the query
 * route keeps its own smaller cap.
 */

import request from 'supertest';
import { buildTestApp, bearer } from '../helpers/app.js';
import { signTestToken } from '../helpers/token.js';
import actualApi, { __reset } from '../mocks/actual-api.js';

const CAT_A = '11111111-aaaa-4111-8111-111111111111';
const ACCOUNT_ID = '33333333-cccc-4333-8333-333333333333';

/** A batch body at the documented maximum of 500 operations. */
const buildMaxBatch = () => ({
  operations: Array.from({ length: 500 }, (_, i) => ({
    type: 'setAmount',
    month: '2026-09',
    categoryId: CAT_A,
    amount: i,
  })),
});

/** An import body around 21 kB — over MAX_REQUEST_SIZE, well under the bulk cap. */
const buildImportBody = () => ({
  transactions: Array.from({ length: 120 }, (_, i) => ({
    date: '2026-09-01',
    amount: -100 - i,
    payee_name: `Payee number ${i} with a deliberately long name to add bytes`,
    notes: `Imported row ${i} — padding so the body clears the ordinary route limit`,
  })),
});

describe('per-router body size limits', () => {
  let app;
  let token;

  beforeEach(() => {
    __reset();
    app = buildTestApp();
    token = signTestToken();
  });

  it('accepts a 500-operation batch on POST /v2/budgets/batch', async () => {
    actualApi.batchBudgetUpdates.mockImplementation(async (fn) => fn());
    const body = buildMaxBatch();

    // Guard the premise: the payload really is bigger than MAX_REQUEST_SIZE.
    expect(Buffer.byteLength(JSON.stringify(body))).toBeGreaterThan(10 * 1024);

    const res = await request(app)
      .post('/v2/budgets/batch')
      .set(bearer(token))
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, applied: 500 });
  });

  it('accepts a ~21 kB import body on the nested bulk transactions route', async () => {
    actualApi.importTransactions.mockResolvedValueOnce({ added: [], updated: [] });
    const body = buildImportBody();

    expect(Buffer.byteLength(JSON.stringify(body))).toBeGreaterThan(20 * 1024);

    const res = await request(app)
      .post(`/v2/accounts/${ACCOUNT_ID}/transactions/import`)
      .set(bearer(token))
      .send(body);

    expect(res.status).not.toBe(413);
    expect(res.status).toBe(201);
  });

  it('rejects a 20 kB body on an ordinary route with the shared 413 shape', async () => {
    const body = { account: { name: 'x'.repeat(20 * 1024) } };

    const res = await request(app)
      .post('/v2/accounts')
      .set(bearer(token))
      .send(body);

    expect(res.status).toBe(413);
    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('requestId');
    expect(actualApi.createAccount).not.toHaveBeenCalled();
  });

  it('still parses a query body under the query route limit', async () => {
    actualApi.aqlQuery.mockResolvedValueOnce({ data: [], dependencies: [] });

    const res = await request(app)
      .post('/v2/query')
      .set(bearer(token))
      .send({ query: { table: 'transactions', limit: 5 } });

    expect(res.status).toBe(200);
    expect(actualApi.aqlQuery).toHaveBeenCalled();
  });

  it('rejects a query body over the query route limit', async () => {
    const res = await request(app)
      .post('/v2/query')
      .set(bearer(token))
      .send({ query: { table: 'transactions', filter: { notes: 'y'.repeat(11 * 1024) } } });

    expect(res.status).toBe(413);
    expect(actualApi.aqlQuery).not.toHaveBeenCalled();
  });
});
