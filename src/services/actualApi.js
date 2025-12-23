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
    { syncBefore: false, syncAfter: true }
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
    { syncBefore: true, syncAfter: true }
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
    { syncBefore: true, syncAfter: true }
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
    { syncBefore: true, syncAfter: true }
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
    { syncBefore: true, syncAfter: true }
  );
};

// ================ TRANSACTIONS ================
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
    { syncBefore: false, syncAfter: true }
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
    { syncBefore: true, syncAfter: true }
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
    { syncBefore: true, syncAfter: true }
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
    { syncBefore: true, syncAfter: true }
  );
};

// ================ CATEGORIES ================
export const categoriesList = async () => {
  return runWithApi('categoriesList', async (apiInstance) => {
    logger.debug('[Actual] Getting categories list');
    const categories = await apiInstance.getCategories();
    logger.info('[Actual] categoriesList result', { count: categories.length });
    return categories;
  });
};

export const categoryCreate = async (category) => {
  return runWithApi(
    'categoryCreate',
    async (apiInstance) => {
      logger.debug('[Actual] Creating category', { categoryName: category.name });
      const id = await apiInstance.createCategory(category);
      logger.info('[Actual] categoryCreate result', { categoryId: id, categoryName: category.name });
      return id;
    },
    { syncBefore: true, syncAfter: true }
  );
};

export const categoryUpdate = async (id, fields) => {
  return runWithApi(
    'categoryUpdate',
    async (apiInstance) => {
      logger.debug('[Actual] Updating category', { categoryId: id, fields });
      const result = await apiInstance.updateCategory(id, fields);
      logger.info('[Actual] categoryUpdate completed', { categoryId: id, result });
      return result;
    },
    { syncBefore: true, syncAfter: true }
  );
};

export const categoryDelete = async (id) => {
  return runWithApi(
    'categoryDelete',
    async (apiInstance) => {
      logger.debug('[Actual] Deleting category', { categoryId: id });
      const result = await apiInstance.deleteCategory(id);
      logger.info('[Actual] categoryDelete completed', { categoryId: id, result });
      return result;
    },
    { syncBefore: true, syncAfter: true }
  );
};

// ================ CATEGORY GROUPS ================
export const categoryGroupsList = async () => {
  return runWithApi('categoryGroupsList', async (apiInstance) => {
    logger.debug('[Actual] Getting category groups list');
    const groups = await apiInstance.getCategoryGroups();
    logger.info('[Actual] categoryGroupsList result', { count: groups.length });
    return groups;
  });
};

export const categoryGroupCreate = async (group) => {
  return runWithApi(
    'categoryGroupCreate',
    async (apiInstance) => {
      logger.debug('[Actual] Creating category group', { groupName: group.name });
      const id = await apiInstance.createCategoryGroup(group);
      logger.info('[Actual] categoryGroupCreate result', { groupId: id, groupName: group.name });
      return id;
    },
    { syncBefore: true, syncAfter: true }
  );
};

export const categoryGroupUpdate = async (id, fields) => {
  return runWithApi(
    'categoryGroupUpdate',
    async (apiInstance) => {
      logger.debug('[Actual] Updating category group', { groupId: id, fields });
      await apiInstance.updateCategoryGroup(id, fields);
      logger.info('[Actual] categoryGroupUpdate completed', { groupId: id });
    },
    { syncBefore: true, syncAfter: true }
  );
};

export const categoryGroupDelete = async (id) => {
  return runWithApi(
    'categoryGroupDelete',
    async (apiInstance) => {
      logger.debug('[Actual] Deleting category group', { groupId: id });
      await apiInstance.deleteCategoryGroup(id);
      logger.info('[Actual] categoryGroupDelete completed', { groupId: id });
    },
    { syncBefore: true, syncAfter: true }
  );
};

// ================ PAYEES ================
export const payeesList = async () => {
  return runWithApi('payeesList', async (apiInstance) => {
    logger.debug('[Actual] Getting payees list');
    const payees = await apiInstance.getPayees();
    logger.info('[Actual] payeesList result', { count: payees.length });
    return payees;
  });
};

export const payeeCreate = async (payee) => {
  return runWithApi(
    'payeeCreate',
    async (apiInstance) => {
      logger.debug('[Actual] Creating payee', { payeeName: payee.name });
      const id = await apiInstance.createPayee(payee);
      logger.info('[Actual] payeeCreate result', { payeeId: id, payeeName: payee.name });
      return id;
    },
    { syncBefore: false, syncAfter: true }
  );
};

export const payeeUpdate = async (id, fields) => {
  return runWithApi(
    'payeeUpdate',
    async (apiInstance) => {
      logger.debug('[Actual] Updating payee', { payeeId: id, fields });
      await apiInstance.updatePayee(id, fields);
      logger.info('[Actual] payeeUpdate completed', { payeeId: id });
    },
    { syncBefore: true, syncAfter: true }
  );
};

export const payeeDelete = async (id) => {
  return runWithApi(
    'payeeDelete',
    async (apiInstance) => {
      logger.debug('[Actual] Deleting payee', { payeeId: id });
      await apiInstance.deletePayee(id);
      logger.info('[Actual] payeeDelete completed', { payeeId: id });
    },
    { syncBefore: true, syncAfter: true }
  );
};

export const payeesMerge = async (targetId, mergeIds) => {
  return runWithApi(
    'payeesMerge',
    async (apiInstance) => {
      logger.debug('[Actual] Merging payees', { targetId, mergeIds, count: mergeIds.length });
      await apiInstance.mergePayees(targetId, mergeIds);
      logger.info('[Actual] payeesMerge completed', { targetId, mergedCount: mergeIds.length });
    },
    { syncBefore: true, syncAfter: true }
  );
};

// ================ BUDGETS ================
export const budgetMonthsList = async () => {
  return runWithApi('budgetMonthsList', async (apiInstance) => {
    logger.debug('[Actual] Getting budget months list');
    const months = await apiInstance.getBudgetMonths();
    logger.info('[Actual] budgetMonthsList result', { count: months.length });
    return months;
  });
};

export const budgetMonthGet = async (month) => {
  return runWithApi('budgetMonthGet', async (apiInstance) => {
    logger.debug('[Actual] Getting budget month', { month });
    const budgetMonth = await apiInstance.getBudgetMonth(month);
    logger.info('[Actual] budgetMonthGet result', { month, toBudget: budgetMonth.toBudget });
    return budgetMonth;
  });
};

export const budgetSetAmount = async (month, categoryId, amount) => {
  return runWithApi(
    'budgetSetAmount',
    async (apiInstance) => {
      logger.debug('[Actual] Setting budget amount', { month, categoryId, amount });
      await apiInstance.setBudgetAmount(month, categoryId, amount);
      logger.info('[Actual] budgetSetAmount completed', { month, categoryId, amount });
    },
    { syncBefore: true, syncAfter: true }
  );
};

export const budgetSetCarryover = async (month, categoryId, flag) => {
  return runWithApi(
    'budgetSetCarryover',
    async (apiInstance) => {
      logger.debug('[Actual] Setting budget carryover', { month, categoryId, flag });
      await apiInstance.setBudgetCarryover(month, categoryId, flag);
      logger.info('[Actual] budgetSetCarryover completed', { month, categoryId, flag });
    },
    { syncBefore: true, syncAfter: true }
  );
};

export const budgetHoldNextMonth = async (month, amount) => {
  return runWithApi(
    'budgetHoldNextMonth',
    async (apiInstance) => {
      logger.debug('[Actual] Holding budget for next month', { month, amount });
      const result = await apiInstance.holdBudgetForNextMonth(month, amount);
      logger.info('[Actual] budgetHoldNextMonth completed', { month, amount, result });
      return result;
    },
    { syncBefore: true, syncAfter: true }
  );
};

export const budgetResetHold = async (month) => {
  return runWithApi(
    'budgetResetHold',
    async (apiInstance) => {
      logger.debug('[Actual] Resetting budget hold', { month });
      await apiInstance.resetBudgetHold(month);
      logger.info('[Actual] budgetResetHold completed', { month });
    },
    { syncBefore: true, syncAfter: true }
  );
};

// ================ RULES ================
export const rulesList = async () => {
  return runWithApi('rulesList', async (apiInstance) => {
    logger.debug('[Actual] Getting rules list');
    const rules = await apiInstance.getRules();
    logger.info('[Actual] rulesList result', { count: rules.length });
    return rules;
  });
};

export const payeeRulesList = async (payeeId) => {
  return runWithApi('payeeRulesList', async (apiInstance) => {
    logger.debug('[Actual] Getting payee rules', { payeeId });
    const rules = await apiInstance.getPayeeRules(payeeId);
    logger.info('[Actual] payeeRulesList result', { payeeId, count: rules.length });
    return rules;
  });
};

export const ruleCreate = async (rule) => {
  return runWithApi(
    'ruleCreate',
    async (apiInstance) => {
      logger.debug('[Actual] Creating rule', { ruleStage: rule.stage });
      const result = await apiInstance.createRule(rule);
      logger.info('[Actual] ruleCreate result', { ruleId: result.id, ruleStage: rule.stage });
      return result;
    },
    { syncBefore: true, syncAfter: true }
  );
};

export const ruleUpdate = async (id, fields) => {
  return runWithApi(
    'ruleUpdate',
    async (apiInstance) => {
      logger.debug('[Actual] Updating rule', { ruleId: id });
      const result = await apiInstance.updateRule(id, fields);
      logger.info('[Actual] ruleUpdate completed', { ruleId: id, result });
      return result;
    },
    { syncBefore: true, syncAfter: true }
  );
};

export const ruleDelete = async (id) => {
  return runWithApi(
    'ruleDelete',
    async (apiInstance) => {
      logger.debug('[Actual] Deleting rule', { ruleId: id });
      const result = await apiInstance.deleteRule(id);
      logger.info('[Actual] ruleDelete completed', { ruleId: id, result });
      return result;
    },
    { syncBefore: true, syncAfter: true }
  );
};

// ================ SCHEDULES ================
export const schedulesList = async () => {
  return runWithApi('schedulesList', async (apiInstance) => {
    logger.debug('[Actual] Getting schedules list');
    const schedules = await apiInstance.getSchedules();
    logger.info('[Actual] schedulesList result', { count: schedules.length });
    return schedules;
  });
};

export const scheduleCreate = async (schedule) => {
  return runWithApi(
    'scheduleCreate',
    async (apiInstance) => {
      logger.debug('[Actual] Creating schedule', { scheduleName: schedule.name });
      const id = await apiInstance.createSchedule({ schedule });
      logger.info('[Actual] scheduleCreate result', { scheduleId: id, scheduleName: schedule.name });
      return id;
    },
    { syncBefore: true, syncAfter: true }
  );
};

export const scheduleUpdate = async (id, fields) => {
  return runWithApi(
    'scheduleUpdate',
    async (apiInstance) => {
      logger.debug('[Actual] Updating schedule', { scheduleId: id, fields });
      const result = await apiInstance.updateSchedule(id, fields);
      logger.info('[Actual] scheduleUpdate completed', { scheduleId: id, result });
      return result;
    },
    { syncBefore: true, syncAfter: true }
  );
};

export const scheduleDelete = async (id) => {
  return runWithApi(
    'scheduleDelete',
    async (apiInstance) => {
      logger.debug('[Actual] Deleting schedule', { scheduleId: id });
      await apiInstance.deleteSchedule(id);
      logger.info('[Actual] scheduleDelete completed', { scheduleId: id });
    },
    { syncBefore: true, syncAfter: true }
  );
};

// ================ MISC ================
export const runActualQuery = async (query) => {
  return runWithApi('runActualQuery', async (apiInstance) => {
    logger.debug('[Actual] Running query', { table: query.table });
    const result = await apiInstance.runQuery({ query });
    logger.info('[Actual] runActualQuery completed', { 
      table: query.table,
      resultCount: Array.isArray(result) ? result.length : 'non-array'
    });
    return result;
  });
};

export const getIdByName = async (type, name) => {
  return runWithApi('getIdByName', async (apiInstance) => {
    logger.debug('[Actual] Getting ID by name', { type, name });
    const id = await apiInstance.getIDByName({ type, name });
    logger.info('[Actual] getIdByName result', { type, name, id });
    return id;
  });
};