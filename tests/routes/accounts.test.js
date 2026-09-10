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

    it('passes offbudget, closed and account_group_id through to the engine', async () => {
      await request(app)
        .post('/v2/accounts')
        .set(bearer(token))
        .send({
          account: {
            name: 'Savings',
            offbudget: true,
            closed: false,
            account_group_id: 'grp-1',
          },
        });

      // initialBalance defaults to 0 in the service. The engine treats 0 and
      // null identically (dist/index.js:111077 skips the starting-balance
      // transaction unless balance is non-zero), so this is not a stray write.
      expect(actualApi.createAccount).toHaveBeenCalledWith(
        { name: 'Savings', offbudget: true, closed: false, account_group_id: 'grp-1' },
        0
      );
      // The engine drops account_group_id on create, so the service applies it
      // with a follow-up update inside the same write operation.
      expect(actualApi.updateAccount).toHaveBeenCalledWith('new-id', {
        account_group_id: 'grp-1',
      });
    });

    it('normalises the legacy offBudget alias to the SDK spelling', async () => {
      await request(app)
        .post('/v2/accounts')
        .set(bearer(token))
        .send({ account: { name: 'Savings', offBudget: true } });

      expect(actualApi.createAccount).toHaveBeenCalledWith({ name: 'Savings', offbudget: true }, 0);
    });
  });

  describe('PUT /v2/accounts/:id', () => {
    it('passes offbudget, closed and account_group_id through to the engine', async () => {
      const res = await request(app)
        .put('/v2/accounts/acc-1')
        .set(bearer(token))
        .send({ fields: { offbudget: false, closed: true, account_group_id: null } });

      expect(res.status).toBe(200);
      expect(actualApi.updateAccount).toHaveBeenCalledWith('acc-1', {
        offbudget: false,
        closed: true,
        account_group_id: null,
      });
    });
  });

  describe('GET /v2/accounts/:id/balance', () => {
    beforeEach(() => {
      actualApi.getAccounts.mockResolvedValue([{ id: 'acc-1', name: 'Checking' }]);
      actualApi.getAccountBalance.mockResolvedValue(12345);
    });

    it('hands the engine a Date built from a plain YYYY-MM-DD cutoff', async () => {
      const res = await request(app)
        .get('/v2/accounts/acc-1/balance?cutoff=2026-03-01')
        .set(bearer(token));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, balance: 12345 });

      const [, cutoff] = actualApi.getAccountBalance.mock.calls[0];
      expect(cutoff).toBeInstanceOf(Date);
      expect(cutoff.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    });

    it('hands the engine a Date built from a full ISO cutoff', async () => {
      await request(app)
        .get('/v2/accounts/acc-1/balance?cutoff=2026-03-01T12:30:00.000Z')
        .set(bearer(token));

      const [, cutoff] = actualApi.getAccountBalance.mock.calls[0];
      expect(cutoff).toBeInstanceOf(Date);
      expect(cutoff.toISOString()).toBe('2026-03-01T12:30:00.000Z');
    });

    it('omits the cutoff when the query string has none', async () => {
      await request(app).get('/v2/accounts/acc-1/balance').set(bearer(token));

      expect(actualApi.getAccountBalance).toHaveBeenCalledWith('acc-1', undefined);
    });

    it('rejects an unparseable cutoff instead of sending an Invalid Date', async () => {
      const res = await request(app)
        .get('/v2/accounts/acc-1/balance?cutoff=not-a-date')
        .set(bearer(token));

      expect(res.status).toBe(400);
      expect(actualApi.getAccountBalance).not.toHaveBeenCalled();
    });

    it('rejects a calendar-shaped but impossible cutoff', async () => {
      const res = await request(app)
        .get('/v2/accounts/acc-1/balance?cutoff=2026-13-45')
        .set(bearer(token));

      expect(res.status).toBe(400);
      expect(actualApi.getAccountBalance).not.toHaveBeenCalled();
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
