/**
 * POST /v2/query.
 *
 * queryLimiter caps this endpoint at 20 requests per window and the limiter is
 * a module singleton shared by every buildTestApp(), so keep the request count
 * in this file well under that.
 */

import request from 'supertest';
import { buildTestApp, bearer } from '../helpers/app.js';
import { signTestToken } from '../helpers/token.js';
import actualApi, { __reset } from '../mocks/actual-api.js';
import { ACTUAL_QUERY_MAX_RESULTS } from '../../src/config/index.js';

const envelope = (data) => ({ data, dependencies: [] });

describe('POST /v2/query', () => {
  let app;
  let token;

  beforeEach(() => {
    __reset();
    app = buildTestApp();
    token = signTestToken();
  });

  it('returns the rows the engine produced', async () => {
    const rows = [{ id: 't-1', amount: -500 }];
    actualApi.aqlQuery.mockResolvedValueOnce(envelope(rows));

    const res = await request(app)
      .post('/v2/query')
      .set(bearer(token))
      .send({ query: { table: 'transactions', select: ['id', 'amount'] } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: rows,
      truncated: false,
      result: rows,
    });
  });

  it('flags a truncated response and caps it at the configured maximum', async () => {
    const rows = Array.from({ length: ACTUAL_QUERY_MAX_RESULTS + 5 }, (_unused, i) => ({ id: i }));
    actualApi.aqlQuery.mockResolvedValueOnce(envelope(rows));

    const res = await request(app)
      .post('/v2/query')
      .set(bearer(token))
      .send({ query: { table: 'transactions' } });

    expect(res.status).toBe(200);
    expect(res.body.truncated).toBe(true);
    expect(res.body.data).toHaveLength(ACTUAL_QUERY_MAX_RESULTS);
  });

  it('rejects a table outside the allow-list before reaching the engine', async () => {
    const res = await request(app)
      .post('/v2/query')
      .set(bearer(token))
      .send({ query: { table: 'users' } });

    expect(res.status).toBe(400);
    expect(actualApi.aqlQuery).not.toHaveBeenCalled();
  });

  it('rejects a path-traversal field name in orderBy', async () => {
    const res = await request(app)
      .post('/v2/query')
      .set(bearer(token))
      .send({ query: { table: 'transactions', orderBy: ['../../etc/passwd'] } });

    expect(res.status).toBe(400);
    expect(actualApi.aqlQuery).not.toHaveBeenCalled();
  });

  it('rejects select and calculate together', async () => {
    const res = await request(app)
      .post('/v2/query')
      .set(bearer(token))
      .send({ query: { table: 'transactions', select: ['id'], calculate: { $sum: 'amount' } } });

    expect(res.status).toBe(400);
    expect(actualApi.aqlQuery).not.toHaveBeenCalled();
  });

  it('returns 401 without a token', async () => {
    const res = await request(app)
      .post('/v2/query')
      .send({ query: { table: 'transactions' } });

    expect(res.status).toBe(401);
    expect(actualApi.aqlQuery).not.toHaveBeenCalled();
  });
});
