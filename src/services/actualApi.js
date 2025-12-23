/**
 * Actual Budget API client initialization and lifecycle management.
 */

import { DATA_DIR } from '../config/index.js';
import logger from '../logging/logger.js';

let api = null;

/**
 * Initialize the Actual API client (idempotent).
 */
export const initActualApi = async () => {
  if (api) return api;

  const { default: actualApi } = await import('@actual-app/api');
  api = actualApi;

  logger.info('Initializing Actual Budget API client...');
  try {
    await api.init({
      dataDir: DATA_DIR,
      serverURL: process.env.ACTUAL_SERVER_URL,
      password: process.env.ACTUAL_PASSWORD,
    });

    logger.info('Downloading budget...', { syncId: process.env.ACTUAL_SYNC_ID });
    await api.downloadBudget(process.env.ACTUAL_SYNC_ID);
    logger.info('Actual API initialized and budget downloaded.');
  } catch (error) {
    logger.error('Failed to initialize Actual API', { 
      error: error.message,
      stack: error.stack 
    });
    api = null; // Reset on failure so retry can happen
    throw error;
  }

  return api;
};

/**
 * Get the initialized API instance.
 */
export const getActualApi = async () => {
  if (!api) await initActualApi();
  return api;
};

/**
 * Graceful shutdown.
 */
export const shutdownActualApi = async () => {
  if (api) {
    await api.shutdown();
    logger.info('Actual API shutdown complete.');
    api = null;
  }
};

const runWithApi = async (label, fn, { syncBefore = true, syncAfter = false } = {}) => {
  const instance = await getActualApi();
  const started = Date.now();

  // Sync before operation if requested
  if (syncBefore) {
    try {
      await instance.sync();
    } catch (error) {
      logger.error('[Actual] Sync failed before operation', { 
        label, 
        error: error.message,
        stack: error.stack 
      });
      
      // If sync fails with getPrefs null error, the budget might not be loaded
      // Try to re-download the budget and retry once
      if (error.message?.includes('getPrefs') || error.message?.includes('Cannot destructure')) {
        logger.warn('[Actual] Budget may not be loaded, attempting to re-download...');
        try {
          await instance.downloadBudget(process.env.ACTUAL_SYNC_ID);
          await instance.sync(); // Retry sync after re-download
          logger.info('[Actual] Budget re-downloaded and synced successfully');
        } catch (retryError) {
          logger.error('[Actual] Retry failed after re-download', { 
            error: retryError.message 
          });
          throw new Error(`Budget synchronization failed. The budget may not be properly initialized. Please verify ACTUAL_SYNC_ID (${process.env.ACTUAL_SYNC_ID}) is correct and the Actual Budget server is accessible. Original error: ${error.message}`);
        }
      } else {
        throw new Error(`Failed to sync with Actual Budget server: ${error.message}. Ensure the budget is properly initialized and ACTUAL_SYNC_ID is correct.`);
      }
    }
  }

  const result = await fn(instance);

  // Sync after operation if requested
  if (syncAfter) {
    try {
      await instance.sync();
    } catch (error) {
      logger.error('[Actual] Sync failed after operation', { 
        label, 
        error: error.message,
        stack: error.stack 
      });
      // Don't fail the operation if post-sync fails, but log it
      // The operation itself succeeded, so we don't want to lose that
    }
  }

  const duration = Date.now() - started;
  logger.info('[Actual] operation completed', { label, durationMs: duration });
  return result;
};

// ================ ACCOUNTS ================
export const accountsList = async () => {
  return runWithApi('accountsList', (apiInstance) => apiInstance.getAccounts());
};

export const accountBalance = async (id, cutoff = null) => {
  return runWithApi('accountBalance', (apiInstance) => apiInstance.getAccountBalance(id, cutoff));
};

export const accountCreate = async (account, initialBalance = 0) => {
  return runWithApi(
    'accountCreate',
    async (apiInstance) => apiInstance.createAccount(account, initialBalance),
    { syncBefore: false, syncAfter: true }
  );
};

export const accountUpdate = async (id, fields) => {
  return runWithApi(
    'accountUpdate',
    async (apiInstance) => apiInstance.updateAccount(id, fields),
    { syncBefore: true, syncAfter: true }
  );
};

export const accountClose = async (id, transferAccountId = null, transferCategoryId = null) => {
  return runWithApi(
    'accountClose',
    async (apiInstance) => apiInstance.closeAccount(id, transferAccountId, transferCategoryId),
    { syncBefore: true, syncAfter: true }
  );
};

export const accountReopen = async (id) => {
  return runWithApi(
    'accountReopen',
    async (apiInstance) => apiInstance.reopenAccount(id),
    { syncBefore: true, syncAfter: true }
  );
};

export const accountDelete = async (id) => {
  return runWithApi(
    'accountDelete',
    async (apiInstance) => apiInstance.deleteAccount(id),
    { syncBefore: true, syncAfter: true }
  );
};

// ================ TRANSACTIONS ================
export const transactionsList = async (accountId, startDate = null, endDate = null) => {
  return runWithApi('transactionsList', (apiInstance) =>
    apiInstance.getTransactions(accountId, startDate, endDate)
  );
};

export const transactionsAdd = async (accountId, transactions, runTransfers = false, learnCategories = false) => {
  return runWithApi(
    'transactionsAdd',
    async (apiInstance) =>
      apiInstance.addTransactions(accountId, transactions, runTransfers, learnCategories),
    { syncBefore: false, syncAfter: true }
  );
};

export const transactionsImport = async (accountId, transactions) => {
  return runWithApi(
    'transactionsImport',
    async (apiInstance) => apiInstance.importTransactions(accountId, transactions),
    { syncBefore: true, syncAfter: true }
  );
};

export const transactionUpdate = async (id, fields) => {
  return runWithApi(
    'transactionUpdate',
    async (apiInstance) => apiInstance.updateTransaction(id, fields),
    { syncBefore: true, syncAfter: true }
  );
};

export const transactionDelete = async (id) => {
  return runWithApi(
    'transactionDelete',
    async (apiInstance) => apiInstance.deleteTransaction(id),
    { syncBefore: true, syncAfter: true }
  );
};

// ================ CATEGORIES ================
export const categoriesList = async () => {
  return runWithApi('categoriesList', (apiInstance) => apiInstance.getCategories());
};

export const categoryCreate = async (category) => {
  return runWithApi(
    'categoryCreate',
    async (apiInstance) => apiInstance.createCategory(category),
    { syncBefore: true, syncAfter: true }
  );
};

export const categoryUpdate = async (id, fields) => {
  return runWithApi(
    'categoryUpdate',
    async (apiInstance) => apiInstance.updateCategory(id, fields),
    { syncBefore: true, syncAfter: true }
  );
};

export const categoryDelete = async (id) => {
  return runWithApi(
    'categoryDelete',
    async (apiInstance) => apiInstance.deleteCategory(id),
    { syncBefore: true, syncAfter: true }
  );
};

// ================ CATEGORY GROUPS ================
export const categoryGroupsList = async () => {
  return runWithApi('categoryGroupsList', (apiInstance) => apiInstance.getCategoryGroups());
};

export const categoryGroupCreate = async (group) => {
  return runWithApi(
    'categoryGroupCreate',
    async (apiInstance) => apiInstance.createCategoryGroup(group),
    { syncBefore: true, syncAfter: true }
  );
};

export const categoryGroupUpdate = async (id, fields) => {
  return runWithApi(
    'categoryGroupUpdate',
    async (apiInstance) => apiInstance.updateCategoryGroup(id, fields),
    { syncBefore: true, syncAfter: true }
  );
};

export const categoryGroupDelete = async (id) => {
  return runWithApi(
    'categoryGroupDelete',
    async (apiInstance) => apiInstance.deleteCategoryGroup(id),
    { syncBefore: true, syncAfter: true }
  );
};

// ================ PAYEES ================
export const payeesList = async () => {
  return runWithApi('payeesList', (apiInstance) => apiInstance.getPayees());
};

export const payeeCreate = async (payee) => {
  return runWithApi(
    'payeeCreate',
    async (apiInstance) => apiInstance.createPayee(payee),
    { syncBefore: false, syncAfter: true }
  );
};

export const payeeUpdate = async (id, fields) => {
  return runWithApi(
    'payeeUpdate',
    async (apiInstance) => apiInstance.updatePayee(id, fields),
    { syncBefore: true, syncAfter: true }
  );
};

export const payeeDelete = async (id) => {
  return runWithApi(
    'payeeDelete',
    async (apiInstance) => apiInstance.deletePayee(id),
    { syncBefore: true, syncAfter: true }
  );
};

export const payeesMerge = async (targetId, mergeIds) => {
  return runWithApi(
    'payeesMerge',
    async (apiInstance) => apiInstance.mergePayees(targetId, mergeIds),
    { syncBefore: true, syncAfter: true }
  );
};

// ================ BUDGETS ================
export const budgetMonthsList = async () => {
  return runWithApi('budgetMonthsList', (apiInstance) => apiInstance.getBudgetMonths());
};

export const budgetMonthGet = async (month) => {
  return runWithApi('budgetMonthGet', (apiInstance) => apiInstance.getBudgetMonth(month));
};

export const budgetSetAmount = async (month, categoryId, amount) => {
  return runWithApi(
    'budgetSetAmount',
    async (apiInstance) => apiInstance.setBudgetAmount(month, categoryId, amount),
    { syncBefore: true, syncAfter: true }
  );
};

export const budgetSetCarryover = async (month, categoryId, flag) => {
  return runWithApi(
    'budgetSetCarryover',
    async (apiInstance) => apiInstance.setBudgetCarryover(month, categoryId, flag),
    { syncBefore: true, syncAfter: true }
  );
};

export const budgetHoldNextMonth = async (month, amount) => {
  return runWithApi(
    'budgetHoldNextMonth',
    async (apiInstance) => apiInstance.holdBudgetForNextMonth(month, amount),
    { syncBefore: true, syncAfter: true }
  );
};

export const budgetResetHold = async (month) => {
  return runWithApi(
    'budgetResetHold',
    async (apiInstance) => apiInstance.resetBudgetHold(month),
    { syncBefore: true, syncAfter: true }
  );
};

// ================ RULES ================
export const rulesList = async () => {
  return runWithApi('rulesList', (apiInstance) => apiInstance.getRules());
};

export const payeeRulesList = async (payeeId) => {
  return runWithApi('payeeRulesList', (apiInstance) => apiInstance.getPayeeRules(payeeId));
};

export const ruleCreate = async (rule) => {
  return runWithApi(
    'ruleCreate',
    async (apiInstance) => apiInstance.createRule(rule),
    { syncBefore: true, syncAfter: true }
  );
};

export const ruleUpdate = async (id, fields) => {
  return runWithApi(
    'ruleUpdate',
    async (apiInstance) => apiInstance.updateRule(id, fields),
    { syncBefore: true, syncAfter: true }
  );
};

export const ruleDelete = async (id) => {
  return runWithApi(
    'ruleDelete',
    async (apiInstance) => apiInstance.deleteRule(id),
    { syncBefore: true, syncAfter: true }
  );
};

// ================ SCHEDULES ================
export const schedulesList = async () => {
  return runWithApi('schedulesList', (apiInstance) => apiInstance.getSchedules());
};

export const scheduleCreate = async (schedule) => {
  return runWithApi(
    'scheduleCreate',
    async (apiInstance) => apiInstance.createSchedule({ schedule }),
    { syncBefore: true, syncAfter: true }
  );
};

export const scheduleUpdate = async (id, fields) => {
  return runWithApi(
    'scheduleUpdate',
    async (apiInstance) => apiInstance.updateSchedule(id, fields),
    { syncBefore: true, syncAfter: true }
  );
};

export const scheduleDelete = async (id) => {
  return runWithApi(
    'scheduleDelete',
    async (apiInstance) => apiInstance.deleteSchedule(id),
    { syncBefore: true, syncAfter: true }
  );
};

// ================ MISC ================
export const runActualQuery = async (query) => {
  return runWithApi('runActualQuery', (apiInstance) => apiInstance.runQuery({ query }));
};

export const getIdByName = async (type, name) => {
  return runWithApi('getIdByName', (apiInstance) => apiInstance.getIDByName({ type, name }));
};