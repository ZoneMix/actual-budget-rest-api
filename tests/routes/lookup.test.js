/**
 * GET /v2/lookup/:type/:name — resolve an entity id from its name.
 *
 * `getIDByName(type, name)` takes the two values positionally and its `type`
 * is a closed union of four table names (methods.d.ts:125), so an unknown type
 * is a 400 from the schema rather than an engine round trip.
 *
 * Express decodes path parameters before the handler sees them, so a name
 * containing spaces or apostrophes reaches the engine already decoded; the
 * route must not decode a second time.
 */

import request from 'supertest';
import { buildTestApp, bearer } from '../helpers/app.js';
import { signTestToken } from '../helpers/token.js';
import actualApi, { __reset } from '../mocks/actual-api.js';

const PAYEE_ID = 'd4e5f607-aaaa-41b2-c3d4-e5f607081920';

describe('GET /v2/lookup/:type/:name', () => {
  let app;
  let token;

  beforeEach(() => {
    __reset();
    app = buildTestApp();
    token = signTestToken();
  });

  it('returns 401 without a token and never reaches the engine', async () => {
    const res = await request(app).get('/v2/lookup/payees/Hy-Vee');

    expect(res.status).toBe(401);
    expect(actualApi.getIDByName).not.toHaveBeenCalled();
  });

  it('resolves a name to an id, echoing the type and name back', async () => {
    actualApi.getIDByName.mockResolvedValueOnce(PAYEE_ID);

    const res = await request(app).get('/v2/lookup/payees/Hy-Vee').set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type: 'payees', name: 'Hy-Vee', id: PAYEE_ID });
    expect(actualApi.getIDByName).toHaveBeenCalledWith('payees', 'Hy-Vee');
  });

  it('hands the engine a URL-decoded name', async () => {
    actualApi.getIDByName.mockResolvedValueOnce(PAYEE_ID);

    const res = await request(app)
      .get('/v2/lookup/payees/Trader%20Joe%27s')
      .set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Trader Joe's");
    expect(actualApi.getIDByName).toHaveBeenCalledWith('payees', "Trader Joe's");
  });

  it('accepts every type the SDK union allows', async () => {
    for (const type of ['accounts', 'schedules', 'categories', 'payees']) {
      actualApi.getIDByName.mockResolvedValueOnce('some-id');
      const res = await request(app).get(`/v2/lookup/${type}/Anything`).set(bearer(token));
      expect(res.status).toBe(200);
      expect(res.body.type).toBe(type);
    }
  });

  it('rejects a type outside the SDK union before touching the engine', async () => {
    const res = await request(app).get('/v2/lookup/transactions/Anything').set(bearer(token));

    expect(res.status).toBe(400);
    expect(actualApi.getIDByName).not.toHaveBeenCalled();
  });

  // The SDK handler never resolves null for a miss: it throws
  // APIError(`Not found: ${type} with name ${name}`) — a PLAIN OBJECT, not an
  // Error (dist/index.js:14068, 112711). The old null/undefined branch in the
  // route was therefore unreachable and every miss surfaced as a 400.
  it('answers 404 when the engine rejects with its Not found APIError', async () => {
    actualApi.getIDByName.mockRejectedValueOnce({
      type: 'APIError',
      message: 'Not found: categories with name Nonexistent',
      meta: undefined,
    });

    const res = await request(app).get('/v2/lookup/categories/Nonexistent').set(bearer(token));

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(res.body.error).toContain('categories with name Nonexistent');
    expect(actualApi.getIDByName).toHaveBeenCalledWith('categories', 'Nonexistent');
  });

  it('answers 404 for an accounts miss too', async () => {
    actualApi.getIDByName.mockRejectedValueOnce({
      type: 'APIError',
      message: 'Not found: accounts with name Nonexistent',
    });

    const res = await request(app).get('/v2/lookup/accounts/Nonexistent').set(bearer(token));

    expect(res.status).toBe(404);
  });

  // Any other engine rejection is still the caller's mistake, not a miss.
  it('keeps a non-miss APIError a 400', async () => {
    actualApi.getIDByName.mockRejectedValueOnce({
      type: 'APIError',
      message: 'Provide a valid type',
    });

    const res = await request(app).get('/v2/lookup/payees/Anything').set(bearer(token));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ENGINE_ERROR');
  });
});
