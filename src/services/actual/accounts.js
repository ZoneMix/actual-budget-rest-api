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

export const accountCreate = async (account, initialBalance = 0) => {
  return runWithApi(
    'accountCreate',
    async (apiInstance) => {
      logger.debug('[Actual] Creating account', { accountName: account.name, initialBalance });
      const id = await apiInstance.createAccount(account, initialBalance);
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
