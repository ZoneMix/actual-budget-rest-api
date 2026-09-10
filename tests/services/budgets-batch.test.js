/**
 * budgetBatchUpdate — the one service function that owns the engine for a span
 * rather than a single call.
 *
 * Two properties matter and neither is visible from the route layer:
 *   1. `batchBudgetUpdates` is opened exactly once per request, not once per
 *      operation — that is the whole point of a batch.
 *   2. The operations are applied in the order the client listed them, since
 *      two edits to the same category in one request must resolve
 *      last-write-wins the way the client wrote them.
 *
 * `syncNow` lives here too because it shares the "one engine span" concern:
 * the forced pre-read sync IS its work, so the engine must be asked once.
 */

import actualApi, { __reset } from '../mocks/actual-api.js';
import { budgetBatchUpdate } from '../../src/services/actual/budgets.js';
import { syncNow } from '../../src/services/actual/misc.js';
import { syncPolicy } from '../../src/services/actual/syncPolicy.js';
import { ValidationError } from '../../src/errors/index.js';
import * as barrel from '../../src/services/actualApi.js';

const CAT_A = '11111111-aaaa-4111-8111-111111111111';
const CAT_B = '22222222-bbbb-4222-8222-222222222222';

describe('budgetBatchUpdate', () => {
  beforeEach(() => {
    __reset();
    actualApi.batchBudgetUpdates.mockImplementation(async (fn) => fn());
  });

  it('opens exactly one batch for the whole operation list', async () => {
    await budgetBatchUpdate([
      { type: 'setAmount', month: '2026-09', categoryId: CAT_A, amount: 1 },
      { type: 'setAmount', month: '2026-09', categoryId: CAT_B, amount: 2 },
      { type: 'setCarryover', month: '2026-09', categoryId: CAT_A, flag: true },
    ]);

    expect(actualApi.batchBudgetUpdates).toHaveBeenCalledTimes(1);
    expect(typeof actualApi.batchBudgetUpdates.mock.calls[0][0]).toBe('function');
  });

  it('applies setAmount and setCarryover operations strictly in order', async () => {
    const order = [];
    actualApi.setBudgetAmount.mockImplementation(async (month, categoryId, amount) => {
      order.push(['amount', month, categoryId, amount]);
    });
    actualApi.setBudgetCarryover.mockImplementation(async (month, categoryId, flag) => {
      order.push(['carryover', month, categoryId, flag]);
    });

    await budgetBatchUpdate([
      { type: 'setAmount', month: '2026-09', categoryId: CAT_A, amount: 100 },
      { type: 'setCarryover', month: '2026-09', categoryId: CAT_A, flag: true },
      { type: 'setAmount', month: '2026-09', categoryId: CAT_A, amount: 250 },
    ]);

    expect(order).toEqual([
      ['amount', '2026-09', CAT_A, 100],
      ['carryover', '2026-09', CAT_A, true],
      ['amount', '2026-09', CAT_A, 250],
    ]);
  });

  it('returns how many operations were applied', async () => {
    const applied = await budgetBatchUpdate([
      { type: 'setAmount', month: '2026-09', categoryId: CAT_A, amount: 1 },
      { type: 'setAmount', month: '2026-10', categoryId: CAT_A, amount: 2 },
    ]);

    expect(applied).toBe(2);
  });

  it('syncs after the batch, like any other write', async () => {
    await budgetBatchUpdate([{ type: 'setAmount', month: '2026-09', categoryId: CAT_A, amount: 1 }]);

    expect(actualApi.sync).toHaveBeenCalled();
  });

  // The route validates against a discriminated union, so an unknown type
  // cannot arrive over HTTP today. The dispatch must still refuse it rather
  // than fall through: silently applying a carryover because an operation was
  // "not setAmount" is how a future third op type becomes a data-corruption
  // bug instead of a 400.
  it('refuses an operation type it does not implement', async () => {
    await expect(
      budgetBatchUpdate([{ type: 'setHold', month: '2026-09', categoryId: CAT_A, amount: 1 }])
    ).rejects.toThrow(ValidationError);

    expect(actualApi.setBudgetCarryover).not.toHaveBeenCalled();
    expect(actualApi.setBudgetAmount).not.toHaveBeenCalled();
  });

  it('names the offending type in the error', async () => {
    await expect(
      budgetBatchUpdate([{ type: 'setHold', month: '2026-09', categoryId: CAT_A, amount: 1 }])
    ).rejects.toThrow(/setHold/);
  });

  it('is re-exported from the service barrel', () => {
    expect(barrel.budgetBatchUpdate).toBe(budgetBatchUpdate);
  });
});

describe('syncNow', () => {
  beforeEach(() => {
    __reset();
  });

  it('forces exactly one sync and reports when it happened', async () => {
    const syncedAt = await syncNow();

    expect(actualApi.sync).toHaveBeenCalledTimes(1);
    expect(new Date(syncedAt).toISOString()).toBe(syncedAt);
  });

  it('forces a sync even when the policy considers the copy fresh', async () => {
    syncPolicy.markSynced();
    expect(syncPolicy.shouldSyncBefore()).toBe(false);

    await syncNow();

    expect(actualApi.sync).toHaveBeenCalledTimes(1);
  });

  it('is re-exported from the service barrel', () => {
    expect(barrel.syncNow).toBe(syncNow);
  });
});
