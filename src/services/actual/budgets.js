/**
 * Budget month operations against the Actual engine.
 */

import logger from '../../logging/logger.js';
import { runWithApi } from './runner.js';

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
