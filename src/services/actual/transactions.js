/**
 * Transaction operations against the Actual engine.
 */

import logger from '../../logging/logger.js';
import { runWithApi } from './runner.js';

export const transactionsList = async (accountId, startDate = undefined, endDate = undefined) => {
  return runWithApi('transactionsList', async (apiInstance) => {
    // Verify account exists first
    const accounts = await apiInstance.getAccounts();
    const account = accounts.find(acc => acc.id === accountId);

    if (!account) {
      logger.warn('[Actual] Account not found for transactionsList', {
        accountId,
        availableAccounts: accounts.map(a => ({ id: a.id, name: a.name }))
      });
      throw new Error(`Account with id ${accountId} not found`);
    }

    // Actual API requires both startDate and endDate as strings
    // If not provided, use a very wide date range to get all transactions
    const start = startDate || '1970-01-01';
    const end = endDate || '2099-12-31';

    logger.debug('[Actual] Getting transactions', {
      accountId,
      accountName: account.name,
      startDate: start,
      endDate: end,
      dateRangeProvided: !!(startDate && endDate)
    });

    const transactions = await apiInstance.getTransactions(accountId, start, end);

    logger.info('[Actual] transactionsList result', {
      accountId,
      accountName: account.name,
      transactionCount: transactions.length
    });

    return transactions;
  });
};

/**
 * Adds transactions to an account.
 *
 * The SDK takes the two flags as a single options object, NOT as positional
 * arguments (@actual-app/api/@types/methods.d.ts:57), and resolves with the
 * literal string 'ok' — never a list of created ids. Callers must not treat
 * the resolved value as a collection.
 */
export const transactionsAdd = async (accountId, transactions, runTransfers = false, learnCategories = false) => {
  return runWithApi(
    'transactionsAdd',
    async (apiInstance) => {
      logger.debug('[Actual] Adding transactions', {
        accountId,
        transactionCount: transactions.length,
        runTransfers,
        learnCategories
      });
      const result = await apiInstance.addTransactions(accountId, transactions, { learnCategories, runTransfers });
      logger.info('[Actual] transactionsAdd completed', {
        accountId,
        transactionCount: transactions.length,
        result
      });
      return result;
    },
    { mode: 'write' }
  );
};

/**
 * Imports transactions with reconciliation.
 *
 * `opts` is the SDK's ImportTransactionsOpts
 * (@actual-app/api/@types/methods.d.ts:61). Passing `undefined` is deliberate:
 * the SDK then applies its own defaults, which an empty object would not.
 * The engine result ({ added, updated, updatedPreview, errors }) is returned
 * unchanged.
 */
export const transactionsImport = async (accountId, transactions, opts = undefined) => {
  return runWithApi(
    'transactionsImport',
    async (apiInstance) => {
      logger.debug('[Actual] Importing transactions', {
        accountId,
        transactionCount: transactions.length,
        optsKeys: opts ? Object.keys(opts) : []
      });
      const result = await apiInstance.importTransactions(accountId, transactions, opts);
      logger.info('[Actual] transactionsImport completed', {
        accountId,
        transactionCount: transactions.length,
        added: result?.added?.length ?? 0,
        updated: result?.updated?.length ?? 0,
        errors: result?.errors?.length ?? 0
      });
      return result;
    },
    { mode: 'write' }
  );
};

export const transactionUpdate = async (id, fields) => {
  return runWithApi(
    'transactionUpdate',
    async (apiInstance) => {
      logger.debug('[Actual] Updating transaction', { transactionId: id, fields });
      const result = await apiInstance.updateTransaction(id, fields);
      logger.info('[Actual] transactionUpdate completed', {
        transactionId: id,
        updatedCount: Array.isArray(result) ? result.length : 1
      });
      return result;
    },
    { mode: 'write' }
  );
};

export const transactionDelete = async (id) => {
  return runWithApi(
    'transactionDelete',
    async (apiInstance) => {
      logger.debug('[Actual] Deleting transaction', { transactionId: id });
      const result = await apiInstance.deleteTransaction(id);
      logger.info('[Actual] transactionDelete completed', {
        transactionId: id,
        deletedCount: Array.isArray(result) ? result.length : 1
      });
      return result;
    },
    { mode: 'write' }
  );
};
