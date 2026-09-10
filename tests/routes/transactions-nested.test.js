/**
 * /v2/accounts/:accountId/transactions routes.
 *
 * Pins the wire contract AND the exact engine call, so a regression in either
 * the route or the service layer fails here.
 */

import request from 'supertest';
import { buildTestApp, bearer } from '../helpers/app.js';
import { signTestToken } from '../helpers/token.js';
import actualApi, { __reset } from '../mocks/actual-api.js';

// AccountIdParamsSchema requires a real UUID.
const ACCOUNT_ID = '11111111-2222-4333-8444-555555555555';
const BASE = `/v2/accounts/${ACCOUNT_ID}/transactions`;

const TX_A = { date: '2026-01-01', amount: -500 };
const TX_B = { date: '2026-01-02', amount: -750 };

describe('/v2/accounts/:accountId/transactions', () => {
  let app;
  let token;

  beforeEach(() => {
    __reset();
    app = buildTestApp();
    token = signTestToken();
  });

  describe('POST /', () => {
    it('forwards the flags to the engine as an options object', async () => {
      const res = await request(app)
        .post(BASE)
        .set(bearer(token))
        .send({ transactions: [TX_A, TX_B], runTransfers: true, learnCategories: true });

      expect(res.status).toBe(201);
      expect(actualApi.addTransactions).toHaveBeenCalledWith(
        ACCOUNT_ID,
        [TX_A, TX_B],
        { learnCategories: true, runTransfers: true }
      );
    });

    it('reports submittedCount and the deprecated addedCount as the submitted length', async () => {
      const res = await request(app)
        .post(BASE)
        .set(bearer(token))
        .send({ transactions: [TX_A, TX_B] });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        success: true,
        accountId: ACCOUNT_ID,
        result: 'ok',
        submittedCount: 2,
        addedCount: 2,
      });
      // 'ok'.length === 2 was the old bug; a 3-transaction body proves it is gone.
      expect(res.body).not.toHaveProperty('addedIds');
    });

    it('counts three transactions as three, not as the length of the ok sentinel', async () => {
      const res = await request(app)
        .post(BASE)
        .set(bearer(token))
        .send({ transactions: [TX_A, TX_B, { date: '2026-01-03', amount: -100 }] });

      expect(res.body.submittedCount).toBe(3);
      expect(res.body.addedCount).toBe(3);
    });

    it('marks the response deprecated for the addedCount field', async () => {
      const res = await request(app)
        .post(BASE)
        .set(bearer(token))
        .send({ transactions: [TX_A] });

      expect(res.headers.deprecation).toBe('true');
      expect(res.headers.warning).toBe(
        '299 - "addedCount is deprecated; use submittedCount. Removed in 3.0.0"'
      );
    });

    it('defaults both flags to false when the body omits them', async () => {
      await request(app).post(BASE).set(bearer(token)).send({ transactions: [TX_A] });

      expect(actualApi.addTransactions).toHaveBeenCalledWith(
        ACCOUNT_ID,
        [TX_A],
        { learnCategories: false, runTransfers: false }
      );
    });
  });

  describe('POST /import', () => {
    beforeEach(() => {
      actualApi.importTransactions.mockResolvedValue({ added: ['t-1'], updated: [], errors: [] });
    });

    it('forwards the validated opts as the third engine argument', async () => {
      const res = await request(app)
        .post(`${BASE}/import`)
        .set(bearer(token))
        .send({
          transactions: [TX_A],
          opts: { defaultCleared: false, dryRun: true, payeeNameNormalization: 'title-case' },
        });

      expect(res.status).toBe(201);
      expect(actualApi.importTransactions).toHaveBeenCalledWith(ACCOUNT_ID, [TX_A], {
        defaultCleared: false,
        dryRun: true,
        payeeNameNormalization: 'title-case',
      });
    });

    it('omits opts entirely when the body has none', async () => {
      await request(app).post(`${BASE}/import`).set(bearer(token)).send({ transactions: [TX_A] });

      expect(actualApi.importTransactions).toHaveBeenCalledWith(ACCOUNT_ID, [TX_A], undefined);
    });

    it('returns the engine result unchanged', async () => {
      const res = await request(app)
        .post(`${BASE}/import`)
        .set(bearer(token))
        .send({ transactions: [TX_A] });

      expect(res.body).toEqual({
        success: true,
        accountId: ACCOUNT_ID,
        result: { added: ['t-1'], updated: [], errors: [] },
      });
    });

    it('rejects an unknown opts key', async () => {
      const res = await request(app)
        .post(`${BASE}/import`)
        .set(bearer(token))
        .send({ transactions: [TX_A], opts: { payeeNameNormalization: 'shouty-case' } });

      expect(res.status).toBe(400);
      expect(actualApi.importTransactions).not.toHaveBeenCalled();
    });
  });
});
