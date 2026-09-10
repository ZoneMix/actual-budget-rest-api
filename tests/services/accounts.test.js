/**
 * Account service call shapes against @actual-app/api 26.9.0.
 *
 * Upstream signatures being pinned here:
 *   createAccount(account, initialBalance?)  — @types/methods.d.ts:76
 *   updateAccount(id, fields)                — @types/methods.d.ts:77
 *   getAccountBalance(id, cutoff?: Date)     — @types/methods.d.ts:81
 *
 * `cutoff` is typed as a Date, not a string: the engine forwards it straight
 * into its own date handling, so a raw query-string value would arrive as text.
 */

import actualApi, { __reset } from '../mocks/actual-api.js';
import { accountBalance, accountCreate, accountUpdate } from '../../src/services/actual/accounts.js';

const ACCOUNT = { id: 'acc-1', name: 'Checking' };

describe('account service call shapes', () => {
  beforeEach(() => {
    __reset();
    actualApi.getAccounts.mockResolvedValue([ACCOUNT]);
  });

  describe('accountBalance', () => {
    it('forwards a Date cutoff unchanged', async () => {
      const cutoff = new Date('2026-03-01T00:00:00.000Z');

      await accountBalance('acc-1', cutoff);

      expect(actualApi.getAccountBalance).toHaveBeenCalledWith('acc-1', cutoff);
      expect(actualApi.getAccountBalance.mock.calls[0][1]).toBeInstanceOf(Date);
    });

    it('forwards undefined when no cutoff is given', async () => {
      await accountBalance('acc-1');

      expect(actualApi.getAccountBalance).toHaveBeenCalledWith('acc-1', undefined);
    });
  });

  describe('accountCreate', () => {
    it('forwards offbudget, closed and account_group_id to the engine', async () => {
      const account = {
        name: 'Savings',
        offbudget: true,
        closed: false,
        account_group_id: 'grp-1',
      };

      await accountCreate(account, 2500);

      expect(actualApi.createAccount).toHaveBeenCalledWith(account, 2500);
    });
  });

  describe('accountUpdate', () => {
    it('forwards the fields object verbatim', async () => {
      const fields = { offbudget: false, closed: true, account_group_id: null };

      await accountUpdate('acc-1', fields);

      expect(actualApi.updateAccount).toHaveBeenCalledWith('acc-1', fields);
    });
  });
});
