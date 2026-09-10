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
      const result = await apiInstance.addTransactions(accountId, transactions, runTransfers, learnCategories);
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

export const transactionsImport = async (accountId, transactions) => {
  return runWithApi(
    'transactionsImport',
    async (apiInstance) => {
      logger.debug('[Actual] Importing transactions', {
        accountId,
        transactionCount: transactions.length
      });
      const result = await apiInstance.importTransactions(accountId, transactions);
      logger.info('[Actual] transactionsImport completed', {
        accountId,
        transactionCount: transactions.length,
        newTransactions: result.newTransactions?.length || 0,
        matchedTransactions: result.matchedTransactions?.length || 0,
        errors: result.errors?.length || 0
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
