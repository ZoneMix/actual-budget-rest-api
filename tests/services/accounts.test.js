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

    // The engine's api/account-create handler reads only name, offbudget and
    // closed off the account (dist/index.js:112351-112359), so a group set at
    // creation time is silently dropped. api/account-update does honour it.
    describe('account_group_id', () => {
      it('applies the group with a follow-up update after the create', async () => {
        actualApi.createAccount.mockResolvedValueOnce('acc-new');

        await accountCreate({ name: 'Savings', account_group_id: 'grp-1' }, 0);

        expect(actualApi.updateAccount).toHaveBeenCalledWith('acc-new', {
          account_group_id: 'grp-1',
        });
        expect(actualApi.createAccount.mock.invocationCallOrder[0]).toBeLessThan(
          actualApi.updateAccount.mock.invocationCallOrder[0]
        );
      });

      it('still resolves with the created id, not the update result', async () => {
        actualApi.createAccount.mockResolvedValueOnce('acc-new');

        await expect(accountCreate({ name: 'Savings', account_group_id: 'grp-1' }))
          .resolves.toBe('acc-new');
      });

      it('issues no follow-up update when the account carries no group', async () => {
        await accountCreate({ name: 'Savings' }, 0);

        expect(actualApi.updateAccount).not.toHaveBeenCalled();
      });

      it('applies an explicitly null group, because the caller asked for it', async () => {
        actualApi.createAccount.mockResolvedValueOnce('acc-new');

        await accountCreate({ name: 'Savings', account_group_id: null }, 0);

        expect(actualApi.updateAccount).toHaveBeenCalledWith('acc-new', {
          account_group_id: null,
        });
      });
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
