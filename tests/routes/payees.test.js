/**
 * /v2/payees — the common-payees listing added on top of the existing CRUD.
 *
 * `getCommonPayees()` (methods.d.ts:100) returns the payees Actual considers
 * frequently used. `/common` has to be registered before any `/:id` route, or
 * Express would match it as an id.
 */

import request from 'supertest';
import { buildTestApp, bearer } from '../helpers/app.js';
import { signTestToken } from '../helpers/token.js';
import actualApi, { __reset } from '../mocks/actual-api.js';

describe('GET /v2/payees/common', () => {
  let app;
  let token;

  beforeEach(() => {
    __reset();
    app = buildTestApp();
    token = signTestToken();
  });

  it('returns 401 without a token and never reaches the engine', async () => {
    const res = await request(app).get('/v2/payees/common');

    expect(res.status).toBe(401);
    expect(actualApi.getCommonPayees).not.toHaveBeenCalled();
  });

  it('returns the common payees the engine returned', async () => {
    const payees = [{ id: 'pay-1', name: 'Hy-Vee' }, { id: 'pay-2', name: 'Casey\'s' }];
    actualApi.getCommonPayees.mockResolvedValueOnce(payees);

    const res = await request(app).get('/v2/payees/common').set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, payees });
    expect(actualApi.getCommonPayees).toHaveBeenCalledWith();
  });

  it('does not shadow the full payee listing', async () => {
    actualApi.getPayees.mockResolvedValueOnce([{ id: 'pay-9', name: 'Everyone' }]);

    const res = await request(app).get('/v2/payees').set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.payees).toEqual([{ id: 'pay-9', name: 'Everyone' }]);
    expect(actualApi.getCommonPayees).not.toHaveBeenCalled();
  });
});
