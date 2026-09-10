/**
 * Mock for `@actual-app/api`, wired in via jest.config.js `moduleNameMapper`.
 * Intercepts both the static import shape and the dynamic
 * `await import('@actual-app/api')` that src/services/actualApi.js uses.
 *
 * Usage in a test file:
 *   import actualApi, { __reset } from '../mocks/actual-api.js';
 *   beforeEach(() => __reset());
 *   // ...then assert / override: actualApi.getAccounts.mockResolvedValueOnce([...])
 */

import { jest } from '@jest/globals';

// One name per function exported by node_modules/@actual-app/api/@types/methods.d.ts.
// Kept as a flat list so every method gets a jest.fn() without 65 hand-written lines.
const METHOD_NAMES = [
  'addTransactions', 'aqlQuery', 'batchBudgetUpdates', 'closeAccount', 'createAccount',
  'createAccountGroup', 'createCategory', 'createCategoryGroup', 'createPayee', 'createRule',
  'createSchedule', 'createTag', 'deleteAccount', 'deleteAccountGroup', 'deleteCategory',
  'deleteCategoryGroup', 'deletePayee', 'deleteRule', 'deleteSchedule', 'deleteTag',
  'deleteTransaction', 'downloadBudget', 'exportBudget', 'getAccountBalance', 'getAccountGroups',
  'getAccounts', 'getBudgetMonth', 'getBudgetMonths', 'getBudgets', 'getCategories',
  'getCategoryGroups', 'getCommonPayees', 'getIDByName', 'getNote', 'getPayeeRules',
  'getPayees', 'getPreferences', 'getRules', 'getSchedules', 'getServerVersion',
  'getTags', 'getTransactions', 'holdBudgetForNextMonth', 'importBudget', 'importTransactions',
  'loadBudget', 'mergePayees', 'reopenAccount', 'resetBudgetHold', 'runBankSync',
  'runImport', 'runQuery', 'setBudgetAmount', 'setBudgetCarryover', 'sync',
  'updateAccount', 'updateAccountGroup', 'updateCategory', 'updateCategoryGroup', 'updateNote',
  'updatePayee', 'updateRule', 'updateSchedule', 'updateTag', 'updateTransaction',
];

// `init`/`shutdown` live in @actual-app/api's index, not methods.d.ts, but the
// service module calls them on the same default-exported object.
const LIFECYCLE_NAMES = ['init', 'shutdown'];

// Methods whose real return type (per methods.d.ts) is an array — default to [] on reset.
const LIST_METHOD_NAMES = [
  'getAccounts', 'getAccountGroups', 'getBudgets', 'getBudgetMonths', 'getCategories',
  'getCategoryGroups', 'getCommonPayees', 'getPayeeRules', 'getPayees', 'getRules',
  'getSchedules', 'getTags', 'getTransactions',
];

const ALL_NAMES = [...METHOD_NAMES, ...LIFECYCLE_NAMES];

/**
 * Immutable, chainable query builder mirroring @actual-app/core's `q()`.
 * Every method returns a NEW builder; nothing on `state` is ever mutated.
 */
const makeBuilder = (state) => ({
  filter: (expr) => makeBuilder({ ...state, filterExpressions: [...state.filterExpressions, expr] }),
  select: (exprs) => makeBuilder({
    ...state,
    selectExpressions: Array.isArray(exprs) ? exprs : [exprs],
    calculation: false,
  }),
  calculate: (expr) => makeBuilder({ ...state, selectExpressions: [{ result: expr }], calculation: true }),
  groupBy: (exprs) => makeBuilder({
    ...state,
    groupExpressions: [...state.groupExpressions, ...(Array.isArray(exprs) ? exprs : [exprs])],
  }),
  orderBy: (exprs) => makeBuilder({
    ...state,
    orderExpressions: [...state.orderExpressions, ...(Array.isArray(exprs) ? exprs : [exprs])],
  }),
  limit: (num) => makeBuilder({ ...state, limit: num }),
  offset: (num) => makeBuilder({ ...state, offset: num }),
  options: (opts) => makeBuilder({ ...state, tableOptions: opts }),
  serialize: () => ({ ...state }),
});

export const q = (table) => makeBuilder({
  table,
  filterExpressions: [],
  selectExpressions: [],
  groupExpressions: [],
  orderExpressions: [],
  calculation: false,
  limit: null,
  offset: null,
  tableOptions: {},
});

const actualApi = {
  ...Object.fromEntries(ALL_NAMES.map((name) => [name, jest.fn()])),
  q,
};

/**
 * Resets every mocked function and re-applies sensible test defaults.
 * Call from `beforeEach` in any test that touches the Actual API mock.
 */
export const __reset = () => {
  ALL_NAMES.forEach((name) => actualApi[name].mockReset());

  actualApi.init.mockResolvedValue(undefined);
  actualApi.downloadBudget.mockResolvedValue(undefined);
  actualApi.sync.mockResolvedValue(undefined);
  actualApi.shutdown.mockResolvedValue(undefined);

  LIST_METHOD_NAMES.forEach((name) => actualApi[name].mockResolvedValue([]));

  actualApi.getBudgetMonth.mockResolvedValue({ month: '2026-01', toBudget: 0 });

  METHOD_NAMES
    .filter((name) => name.startsWith('create'))
    .forEach((name) => actualApi[name].mockResolvedValue('new-id'));

  actualApi.addTransactions.mockResolvedValue('ok');
};

__reset();

export default actualApi;
