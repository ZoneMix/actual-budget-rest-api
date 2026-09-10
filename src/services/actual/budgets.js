/**
 * Budget month operations against the Actual engine.
 */

import logger from '../../logging/logger.js';
import { runWithApi } from './runner.js';
import { withEngineExclusive } from './queue.js';

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
    { mode: 'write' }
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
    { mode: 'write' }
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
    { mode: 'write' }
  );
};

/**
 * Applies one operation from a batch. Split out so `budgetBatchUpdate` stays
 * readable and the op-type dispatch is testable in isolation.
 */
const applyBatchOperation = async (apiInstance, operation) => {
  if (operation.type === 'setAmount') {
    return apiInstance.setBudgetAmount(operation.month, operation.categoryId, operation.amount);
  }
  return apiInstance.setBudgetCarryover(operation.month, operation.categoryId, operation.flag);
};

/**
 * Applies many budget edits as one engine transaction.
 *
 * `withEngineExclusive` holds the engine for the whole span, so no other
 * request can interleave a sync or a mutation between the individual edits.
 * The inner `runWithApi` runs inline rather than re-queueing (the queue is
 * reentrant by design) and contributes the post-write sync every other
 * mutation gets.
 *
 * Operations are applied strictly in the order the caller listed them: two
 * edits to the same month/category must resolve last-write-wins the way the
 * client wrote them, so this loop is deliberately sequential.
 *
 * @param {Array<object>} operations - validated setAmount/setCarryover ops
 * @returns {Promise<number>} how many operations were applied
 */
export const budgetBatchUpdate = async (operations) => {
  return withEngineExclusive('budgetBatchUpdate', () =>
    runWithApi(
      'budgetBatchUpdate',
      async (apiInstance) => {
        logger.debug('[Actual] Applying budget batch', { count: operations.length });
        await apiInstance.batchBudgetUpdates(async () => {
          for (const operation of operations) {
            await applyBatchOperation(apiInstance, operation);
          }
        });
        logger.info('[Actual] budgetBatchUpdate completed', { count: operations.length });
        return operations.length;
      },
      { mode: 'write' }
    )
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
    { mode: 'write' }
  );
};
