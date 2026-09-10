/**
 * Account operations against the Actual engine.
 */

import logger from '../../logging/logger.js';
import { runWithApi } from './runner.js';

export const accountsList = async () => {
  return runWithApi('accountsList', async (apiInstance) => {
    logger.debug('[Actual] Getting accounts list');
    const accounts = await apiInstance.getAccounts();
    logger.info('[Actual] accountsList result', { count: accounts.length });
    return accounts;
  });
};

export const accountBalance = async (id, cutoff = undefined) => {
  return runWithApi('accountBalance', async (apiInstance) => {
    // Verify account exists first
    const accounts = await apiInstance.getAccounts();
    const account = accounts.find(acc => acc.id === id);

    if (!account) {
      logger.warn('[Actual] Account not found', { accountId: id, availableAccounts: accounts.map(a => ({ id: a.id, name: a.name })) });
      throw new Error(`Account with id ${id} not found`);
    }

    logger.debug('[Actual] Getting account balance', {
      accountId: id,
      accountName: account.name,
      cutoff: cutoff ? cutoff.toISOString() : 'none'
    });

    // Call getAccountBalance - cutoff is optional in the API
    const balance = await apiInstance.getAccountBalance(id, cutoff);

    logger.info('[Actual] getAccountBalance result', {
      accountId: id,
      accountName: account.name,
      cutoff: cutoff ? cutoff.toISOString() : 'none',
      balance,
      balanceType: typeof balance,
      balanceValue: balance
    });

    return balance;
  });
};

/**
 * Creates an account.
 *
 * The engine's `api/account-create` handler reads only `name`, `offbudget` and
 * `closed` off the account (dist/index.js:112351-112359), so a group supplied
 * at creation time is silently dropped. `api/account-update` does honour it —
 * `accountModel.fromExternal` spreads every field (dist/index.js:111858-111863)
 * — so the group is applied with a follow-up update, inside the same write
 * operation so nothing else can slip into the engine queue between the two.
 */
export const accountCreate = async (account, initialBalance = 0) => {
  return runWithApi(
    'accountCreate',
    async (apiInstance) => {
      logger.debug('[Actual] Creating account', { accountName: account.name, initialBalance });
      const id = await apiInstance.createAccount(account, initialBalance);

      if (account.account_group_id !== undefined) {
        logger.debug('[Actual] Applying account group after create', {
          accountId: id,
          accountGroupId: account.account_group_id,
        });
        await apiInstance.updateAccount(id, { account_group_id: account.account_group_id });
      }

      logger.info('[Actual] accountCreate result', { accountId: id, accountName: account.name });
      return id;
    },
    { mode: 'write' }
  );
};

export const accountUpdate = async (id, fields) => {
  return runWithApi(
    'accountUpdate',
    async (apiInstance) => {
      logger.debug('[Actual] Updating account', { accountId: id, fields });
      await apiInstance.updateAccount(id, fields);
      logger.info('[Actual] accountUpdate completed', { accountId: id });
    },
    { mode: 'write' }
  );
};

export const accountClose = async (id, transferAccountId = undefined, transferCategoryId = undefined) => {
  return runWithApi(
    'accountClose',
    async (apiInstance) => {
      logger.debug('[Actual] Closing account', {
        accountId: id,
        transferAccountId: transferAccountId || 'none',
        transferCategoryId: transferCategoryId || 'none'
      });
      await apiInstance.closeAccount(id, transferAccountId, transferCategoryId);
      logger.info('[Actual] accountClose completed', { accountId: id });
    },
    { mode: 'write' }
  );
};

export const accountReopen = async (id) => {
  return runWithApi(
    'accountReopen',
    async (apiInstance) => {
      logger.debug('[Actual] Reopening account', { accountId: id });
      await apiInstance.reopenAccount(id);
      logger.info('[Actual] accountReopen completed', { accountId: id });
    },
    { mode: 'write' }
  );
};

export const accountDelete = async (id) => {
  return runWithApi(
    'accountDelete',
    async (apiInstance) => {
      logger.debug('[Actual] Deleting account', { accountId: id });
      await apiInstance.deleteAccount(id);
      logger.info('[Actual] accountDelete completed', { accountId: id });
    },
    { mode: 'write' }
  );
};

/**
 * Pulls new transactions from the account's linked bank (GoCardless/SimpleFIN).
 *
 * `runBankSync(args?)` takes an OBJECT (methods.d.ts:29-31); calling it with a
 * bare id would be read as "no args" and sync every linked account instead of
 * this one. It is a write: it creates transactions.
 *
 * @param {string} accountId - account to sync
 */
export const bankSync = async (accountId) => {
  return runWithApi(
    'bankSync',
    async (apiInstance) => {
      logger.debug('[Actual] Running bank sync', { accountId });
      await apiInstance.runBankSync({ accountId });
      logger.info('[Actual] bankSync completed', { accountId });
    },
    { mode: 'write' }
  );
};
