/**
 * Per-domain service modules.
 *
 * One representative function per file, asserting the EXACT engine method and
 * argument list it forwards. Several of these argument shapes are wrong against
 * `@actual-app/api` 26.9.0 (flagged below); the split is behaviour-preserving,
 * so they are pinned here as-is and these expectations change when the calls do.
 */

import actualApi, { __reset } from '../mocks/actual-api.js';

import { accountsList, accountBalance } from '../../src/services/actual/accounts.js';
import { transactionsList, transactionsAdd } from '../../src/services/actual/transactions.js';
import { categoryUpdate } from '../../src/services/actual/categories.js';
import { categoryGroupCreate } from '../../src/services/actual/categoryGroups.js';
import { payeesMerge } from '../../src/services/actual/payees.js';
import { budgetSetAmount } from '../../src/services/actual/budgets.js';
import { ruleUpdate } from '../../src/services/actual/rules.js';
import { scheduleCreate } from '../../src/services/actual/schedules.js';
import { runActualQuery } from '../../src/services/actual/query.js';
import { getIdByName } from '../../src/services/actual/misc.js';

import * as barrel from '../../src/services/actualApi.js';

describe('domain services', () => {
  beforeEach(() => {
    __reset();
    actualApi.getAccounts.mockResolvedValue([{ id: 'a1', name: 'Checking' }]);
  });

  describe('accounts', () => {
    it('accountsList() calls getAccounts()', async () => {
      await accountsList();
      expect(actualApi.getAccounts).toHaveBeenCalledWith();
    });

    it('accountBalance(id, cutoff) calls getAccountBalance(id, cutoff)', async () => {
      await accountBalance('a1', undefined);
      expect(actualApi.getAccountBalance).toHaveBeenCalledWith('a1', undefined);
    });

    it('accountBalance rejects for an unknown account before touching the engine', async () => {
      await expect(accountBalance('missing')).rejects.toThrow('Account with id missing not found');
      expect(actualApi.getAccountBalance).not.toHaveBeenCalled();
    });
  });

  describe('transactions', () => {
    it('transactionsList(id) widens an absent date range to 1970..2099', async () => {
      await transactionsList('a1');
      expect(actualApi.getTransactions).toHaveBeenCalledWith('a1', '1970-01-01', '2099-12-31');
    });

    it('transactionsAdd forwards runTransfers/learnCategories as an options object', async () => {
      const transactions = [{ date: '2026-01-01', amount: -500 }];
      await transactionsAdd('a1', transactions, true, false);
      expect(actualApi.addTransactions).toHaveBeenCalledWith('a1', transactions, {
        learnCategories: false,
        runTransfers: true,
      });
    });
  });

  describe('categories', () => {
    it('categoryUpdate(id, fields) calls updateCategory(id, fields)', async () => {
      await categoryUpdate('cat-1', { name: 'Groceries' });
      expect(actualApi.updateCategory).toHaveBeenCalledWith('cat-1', { name: 'Groceries' });
    });
  });

  describe('categoryGroups', () => {
    it('categoryGroupCreate(group) calls createCategoryGroup(group)', async () => {
      await categoryGroupCreate({ name: 'Bills' });
      expect(actualApi.createCategoryGroup).toHaveBeenCalledWith({ name: 'Bills' });
    });
  });

  describe('payees', () => {
    it('payeesMerge(targetId, mergeIds) calls mergePayees(targetId, mergeIds)', async () => {
      await payeesMerge('p-1', ['p-2', 'p-3']);
      expect(actualApi.mergePayees).toHaveBeenCalledWith('p-1', ['p-2', 'p-3']);
    });
  });

  describe('budgets', () => {
    it('budgetSetAmount(month, categoryId, amount) calls setBudgetAmount(...)', async () => {
      await budgetSetAmount('2026-01', 'cat-1', 12345);
      expect(actualApi.setBudgetAmount).toHaveBeenCalledWith('2026-01', 'cat-1', 12345);
    });
  });

  describe('rules', () => {
    it('ruleUpdate(id, fields) merges onto the current rule and calls updateRule(rule)', async () => {
      actualApi.getRules.mockResolvedValue([{ id: 'r-1', stage: 'post', conditions: [], actions: [] }]);
      await ruleUpdate('r-1', { stage: 'pre' });
      expect(actualApi.updateRule).toHaveBeenCalledWith({
        id: 'r-1',
        stage: 'pre',
        conditions: [],
        actions: [],
      });
    });
  });

  describe('schedules', () => {
    // Known wrong shape: the SDK takes the schedule directly, not { schedule }.
    it('scheduleCreate(schedule) calls createSchedule({ schedule })', async () => {
      await scheduleCreate({ name: 'Rent' });
      expect(actualApi.createSchedule).toHaveBeenCalledWith({ schedule: { name: 'Rent' } });
    });
  });

  describe('query', () => {
    // Known wrong shape: the SDK takes the serialised query directly.
    it('runActualQuery(query) calls runQuery({ query })', async () => {
      const query = { table: 'transactions' };
      await runActualQuery(query);
      expect(actualApi.runQuery).toHaveBeenCalledWith({ query });
    });
  });

  describe('misc', () => {
    // Known wrong shape: the SDK takes (type, name) positionally.
    it('getIdByName(type, name) calls getIDByName({ type, name })', async () => {
      await getIdByName('accounts', 'Checking');
      expect(actualApi.getIDByName).toHaveBeenCalledWith({ type: 'accounts', name: 'Checking' });
    });
  });

  describe('barrel', () => {
    it('src/services/actualApi.js re-exports every domain function routes import', () => {
      const exported = [
        'accountsList', 'accountBalance', 'accountCreate', 'accountUpdate', 'accountClose',
        'accountReopen', 'accountDelete', 'transactionsList', 'transactionsAdd',
        'transactionsImport', 'transactionUpdate', 'transactionDelete', 'categoriesList',
        'categoryCreate', 'categoryUpdate', 'categoryDelete', 'categoryGroupsList',
        'categoryGroupCreate', 'categoryGroupUpdate', 'categoryGroupDelete', 'payeesList',
        'payeeCreate', 'payeeUpdate', 'payeeDelete', 'payeesMerge', 'budgetMonthsList',
        'budgetMonthGet', 'budgetSetAmount', 'budgetSetCarryover', 'budgetHoldNextMonth',
        'budgetResetHold', 'rulesList', 'payeeRulesList', 'ruleCreate', 'ruleUpdate',
        'ruleDelete', 'schedulesList', 'scheduleCreate', 'scheduleUpdate', 'scheduleDelete',
        'runActualQuery', 'getIdByName', 'initActualApi', 'getActualApi', 'shutdownActualApi',
      ];

      exported.forEach((name) => expect(typeof barrel[name]).toBe('function'));
      expect(barrel.accountsList).toBe(accountsList);
      expect(barrel.getIdByName).toBe(getIdByName);
    });

    it('also re-exports the queue and sync-policy handles the health check needs', () => {
      expect(typeof barrel.getQueueDepth).toBe('function');
      expect(typeof barrel.withEngine).toBe('function');
      expect(typeof barrel.withEngineExclusive).toBe('function');
      expect(typeof barrel.syncPolicy.lastSyncAt).toBe('function');
      expect(typeof barrel.syncPolicy.lastSyncError).toBe('function');
    });
  });
});
