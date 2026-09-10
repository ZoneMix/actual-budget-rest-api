/**
 * /v2/accounts routes.
 *
 * Every test asserts the exact arguments passed to the mocked Actual engine —
 * that's the point of the harness: routes are wired correctly end to end.
 */

import request from 'supertest';
import { buildTestApp, bearer } from '../helpers/app.js';
import { signTestToken } from '../helpers/token.js';
import actualApi, { __reset } from '../mocks/actual-api.js';

describe('/v2/accounts', () => {
  let app;
  let token;

  beforeEach(() => {
    __reset();
    app = buildTestApp();
    token = signTestToken();
  });

  describe('GET /v2/accounts', () => {
    it('returns 401 without a token and never reaches the engine', async () => {
      const res = await request(app).get('/v2/accounts');

      expect(res.status).toBe(401);
      expect(actualApi.getAccounts).not.toHaveBeenCalled();
    });

    it('returns 200 with the accounts the engine returned', async () => {
      const accounts = [{ id: 'acc-1', name: 'Checking' }];
      actualApi.getAccounts.mockResolvedValueOnce(accounts);

      const res = await request(app).get('/v2/accounts').set(bearer(token));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, accounts });
      expect(actualApi.getAccounts).toHaveBeenCalledWith();
    });
  });

  describe('POST /v2/accounts', () => {
    it('creates an account and returns 201 with the new id', async () => {
      actualApi.createAccount.mockResolvedValueOnce('acc-new');

      const res = await request(app)
        .post('/v2/accounts')
        .set(bearer(token))
        .send({ account: { name: 'Test' }, initialBalance: 100 });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ success: true, id: 'acc-new' });
      expect(actualApi.createAccount).toHaveBeenCalledWith({ name: 'Test' }, 100);
    });
  });

  describe('DELETE /v2/accounts/:id', () => {
    it('deletes the account by id', async () => {
      const res = await request(app).delete('/v2/accounts/acc-1').set(bearer(token));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(actualApi.deleteAccount).toHaveBeenCalledWith('acc-1');
    });
  });
});
