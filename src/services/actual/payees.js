/**
 * Payee operations against the Actual engine.
 */

import logger from '../../logging/logger.js';
import { runWithApi } from './runner.js';

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
    { mode: 'write' }
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
    { mode: 'write' }
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
    { mode: 'write' }
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
    { mode: 'write' }
  );
};
