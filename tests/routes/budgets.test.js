/**
 * POST /v2/budgets/batch — many budget edits under one engine transaction.
 *
 * `batchBudgetUpdates(func)` (methods.d.ts:32) takes a callback and applies
 * everything it does as one unit. The wrapper must call it exactly ONCE for a
 * whole request and issue the individual setBudgetAmount/setBudgetCarryover
 * calls inside that callback, in the order the client listed them.
 *
 * The mock does not invoke the callback on its own, so each test that cares
 * about the inner calls wires `mockImplementation` to run it — which is also
 * what proves a callback is what gets passed.
 */

import request from 'supertest';
import { buildTestApp, bearer } from '../helpers/app.js';
import { signTestToken } from '../helpers/token.js';
import actualApi, { __reset } from '../mocks/actual-api.js';

const CAT_A = '11111111-aaaa-4111-8111-111111111111';
const CAT_B = '22222222-bbbb-4222-8222-222222222222';

const runCallback = () => {
  actualApi.batchBudgetUpdates.mockImplementation(async (fn) => fn());
};

describe('POST /v2/budgets/batch', () => {
  let app;
  let token;

  beforeEach(() => {
    __reset();
    app = buildTestApp();
    token = signTestToken();
  });

  it('returns 401 without a token and never reaches the engine', async () => {
    const res = await request(app)
      .post('/v2/budgets/batch')
      .send({ operations: [{ type: 'setAmount', month: '2026-09', categoryId: CAT_A, amount: 100 }] });

    expect(res.status).toBe(401);
    expect(actualApi.batchBudgetUpdates).not.toHaveBeenCalled();
  });

  it('opens exactly one batch and applies the operations in order', async () => {
    runCallback();

    const res = await request(app)
      .post('/v2/budgets/batch')
      .set(bearer(token))
      .send({
        operations: [
          { type: 'setAmount', month: '2026-09', categoryId: CAT_A, amount: 125000 },
          { type: 'setCarryover', month: '2026-09', categoryId: CAT_A, flag: true },
          { type: 'setAmount', month: '2026-10', categoryId: CAT_B, amount: -4500 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, applied: 3 });
    expect(actualApi.batchBudgetUpdates).toHaveBeenCalledTimes(1);
    expect(actualApi.setBudgetAmount.mock.calls).toEqual([
      ['2026-09', CAT_A, 125000],
      ['2026-10', CAT_B, -4500],
    ]);
    expect(actualApi.setBudgetCarryover).toHaveBeenCalledWith('2026-09', CAT_A, true);
  });

  it('rejects a month that is not YYYY-MM before touching the engine', async () => {
    const res = await request(app)
      .post('/v2/budgets/batch')
      .set(bearer(token))
      .send({ operations: [{ type: 'setAmount', month: '2026-9', categoryId: CAT_A, amount: 1 }] });

    expect(res.status).toBe(400);
    expect(actualApi.batchBudgetUpdates).not.toHaveBeenCalled();
  });

  it('rejects an empty operations array', async () => {
    const res = await request(app)
      .post('/v2/budgets/batch')
      .set(bearer(token))
      .send({ operations: [] });

    expect(res.status).toBe(400);
    expect(actualApi.batchBudgetUpdates).not.toHaveBeenCalled();
  });

  it('rejects an unknown operation type', async () => {
    const res = await request(app)
      .post('/v2/budgets/batch')
      .set(bearer(token))
      .send({ operations: [{ type: 'setHold', month: '2026-09', categoryId: CAT_A, amount: 1 }] });

    expect(res.status).toBe(400);
    expect(actualApi.batchBudgetUpdates).not.toHaveBeenCalled();
  });

  it('is not shadowed by the /:month route', async () => {
    runCallback();

    const res = await request(app)
      .post('/v2/budgets/batch')
      .set(bearer(token))
      .send({ operations: [{ type: 'setAmount', month: '2026-09', categoryId: CAT_A, amount: 1 }] });

    expect(res.status).toBe(200);
    expect(actualApi.getBudgetMonth).not.toHaveBeenCalled();
  });
});
