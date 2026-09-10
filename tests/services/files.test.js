/**
 * Budget-file service functions: list, load, export and import.
 *
 * `budgetImport` has no route on purpose — importing replaces the whole
 * ledger. It is still covered here so the call shape stays correct for the day
 * it is exposed behind a flag.
 */

import actualApi, { __reset } from '../mocks/actual-api.js';
import {
  budgetFilesList,
  budgetLoad,
  budgetExport,
  budgetImport,
} from '../../src/services/actual/files.js';
import { syncPolicy } from '../../src/services/actual/syncPolicy.js';
import * as barrel from '../../src/services/actualApi.js';

const BUDGET_ID = 'c3d4e5f6-9999-40a1-b2c3-d4e5f6708192';

describe('budget file services', () => {
  beforeEach(() => {
    __reset();
  });

  it('budgetFilesList() calls getBudgets() with no arguments', async () => {
    const files = [{ id: BUDGET_ID, name: 'Belisario Ledger', state: 'remote' }];
    actualApi.getBudgets.mockResolvedValueOnce(files);

    await expect(budgetFilesList()).resolves.toEqual(files);
    expect(actualApi.getBudgets).toHaveBeenCalledWith();
  });

  it('budgetLoad(id) calls loadBudget(id)', async () => {
    await budgetLoad(BUDGET_ID);

    expect(actualApi.loadBudget).toHaveBeenCalledWith(BUDGET_ID);
  });

  it('budgetLoad forces the next read to sync, so it reflects the new file', async () => {
    // markSynced() from the post-write sync would otherwise leave the policy
    // fresh — against the file that is no longer open.
    await budgetLoad(BUDGET_ID);

    expect(actualApi.sync).toHaveBeenCalled();
    expect(syncPolicy.shouldSyncBefore()).toBe(true);
  });

  it('budgetExport() calls exportBudget() and returns the raw bytes', async () => {
    const bytes = Uint8Array.from([0x50, 0x4b, 0x03, 0x04]);
    actualApi.exportBudget.mockResolvedValueOnce(bytes);

    await expect(budgetExport()).resolves.toBe(bytes);
    expect(actualApi.exportBudget).toHaveBeenCalledWith();
  });

  it('budgetImport(input, opts) forwards both arguments to importBudget', async () => {
    actualApi.importBudget.mockResolvedValueOnce({ id: BUDGET_ID });
    const input = Uint8Array.from([1, 2, 3]);
    const opts = { type: 'ynab5', filename: 'budget.json' };

    await expect(budgetImport(input, opts)).resolves.toEqual({ id: BUDGET_ID });
    expect(actualApi.importBudget).toHaveBeenCalledWith(input, opts);
  });

  it('is re-exported from the service barrel', () => {
    expect(barrel.budgetFilesList).toBe(budgetFilesList);
    expect(barrel.budgetLoad).toBe(budgetLoad);
    expect(barrel.budgetExport).toBe(budgetExport);
    expect(barrel.budgetImport).toBe(budgetImport);
  });
});
