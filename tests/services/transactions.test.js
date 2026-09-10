/**
 * Transaction service call shapes against @actual-app/api 26.9.0.
 *
 * Upstream signatures being pinned here
 * (node_modules/@actual-app/api/@types/methods.d.ts):
 *   addTransactions(accountId, transactions, { learnCategories, runTransfers }?)  :57
 *   importTransactions(accountId, transactions, opts?)                            :61
 */

import actualApi, { __reset } from '../mocks/actual-api.js';
import { transactionsAdd, transactionsImport } from '../../src/services/actual/transactions.js';

const TXS = Object.freeze([{ date: '2026-01-01', amount: -500 }]);

describe('transaction service call shapes', () => {
  beforeEach(() => {
    __reset();
  });

  describe('transactionsAdd', () => {
    it('forwards the flags as the SDK options object, not positional arguments', async () => {
      await transactionsAdd('a1', TXS, true, false);

      expect(actualApi.addTransactions).toHaveBeenCalledWith('a1', TXS, {
        learnCategories: false,
        runTransfers: true,
      });
    });

    it('forwards both flags set', async () => {
      await transactionsAdd('a1', TXS, true, true);

      expect(actualApi.addTransactions).toHaveBeenCalledWith('a1', TXS, {
        learnCategories: true,
        runTransfers: true,
      });
    });

    it('defaults both flags to false when the caller omits them', async () => {
      await transactionsAdd('a1', TXS);

      expect(actualApi.addTransactions).toHaveBeenCalledWith('a1', TXS, {
        learnCategories: false,
        runTransfers: false,
      });
    });

    it("resolves with the engine's 'ok' sentinel unchanged", async () => {
      await expect(transactionsAdd('a1', TXS, false, false)).resolves.toBe('ok');
    });
  });

  describe('transactionsImport', () => {
    it('forwards opts as the third argument', async () => {
      actualApi.importTransactions.mockResolvedValueOnce({ added: [], updated: [], errors: [] });

      await transactionsImport('a1', TXS, { dryRun: true, defaultCleared: false });

      expect(actualApi.importTransactions).toHaveBeenCalledWith('a1', TXS, {
        dryRun: true,
        defaultCleared: false,
      });
    });

    it('passes undefined through so the SDK applies its own opts defaults', async () => {
      actualApi.importTransactions.mockResolvedValueOnce({ added: [], updated: [], errors: [] });

      await transactionsImport('a1', TXS);

      expect(actualApi.importTransactions).toHaveBeenCalledWith('a1', TXS, undefined);
    });

    it('returns the engine result unchanged', async () => {
      const engineResult = { added: ['t-1'], updated: ['t-2'], updatedPreview: [], errors: [] };
      actualApi.importTransactions.mockResolvedValueOnce(engineResult);

      await expect(transactionsImport('a1', TXS, {})).resolves.toBe(engineResult);
    });

    it('tolerates a result missing the added/updated/errors arrays', async () => {
      actualApi.importTransactions.mockResolvedValueOnce({});

      await expect(transactionsImport('a1', TXS)).resolves.toEqual({});
    });
  });
});
