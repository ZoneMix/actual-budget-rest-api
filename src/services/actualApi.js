/**
 * Actual Budget API client initialization and lifecycle management.
 */

import { DATA_DIR } from '../config/index.js';

let api = null;

/**
 * Initialize the Actual API client (idempotent).
 */
export const initActualApi = async () => {
  if (api) return api;

  const { default: actualApi } = await import('@actual-app/api');
  api = actualApi;

  console.log('Initializing Actual Budget API client...');
  await api.init({
    dataDir: DATA_DIR,
    serverURL: process.env.ACTUAL_SERVER_URL,
    password: process.env.ACTUAL_PASSWORD,
  });

  await api.downloadBudget(process.env.ACTUAL_SYNC_ID);
  console.log('Actual API initialized and budget synced.');

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
    console.log('Actual API shutdown complete.');
    api = null;
  }
};

const runWithApi = async (label, fn, { syncBefore = true, syncAfter = false } = {}) => {
  const instance = await getActualApi();
  const started = Date.now();

  if (syncBefore) await instance.sync();

  const result = await fn(instance);

  if (syncAfter) await instance.sync();

  const duration = Date.now() - started;
  console.log(`[Actual] ${label} completed in ${duration}ms`);
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
    { syncBefore: true, syncAfter: true }
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
    { syncBefore: true, syncAfter: true }
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
    { syncBefore: true, syncAfter: true }
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