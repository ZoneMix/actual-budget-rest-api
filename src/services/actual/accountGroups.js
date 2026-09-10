/**
 * Account group operations against the Actual engine.
 *
 * Account groups fold accounts in the sidebar; an account joins one through
 * its `account_group_id` field (see accounts.js), so deleting a group does not
 * delete its accounts (methods.d.ts:82-85).
 */

import logger from '../../logging/logger.js';
import { runWithApi } from './runner.js';

export const accountGroupsList = async () => {
  return runWithApi('accountGroupsList', async (apiInstance) => {
    logger.debug('[Actual] Getting account groups list');
    const groups = await apiInstance.getAccountGroups();
    logger.info('[Actual] accountGroupsList result', { count: groups.length });
    return groups;
  });
};

export const accountGroupCreate = async (group) => {
  return runWithApi(
    'accountGroupCreate',
    async (apiInstance) => {
      logger.debug('[Actual] Creating account group', { groupName: group.name });
      const id = await apiInstance.createAccountGroup(group);
      logger.info('[Actual] accountGroupCreate result', { groupId: id, groupName: group.name });
      return id;
    },
    { mode: 'write' }
  );
};

export const accountGroupUpdate = async (id, fields) => {
  return runWithApi(
    'accountGroupUpdate',
    async (apiInstance) => {
      logger.debug('[Actual] Updating account group', { groupId: id, fields });
      await apiInstance.updateAccountGroup(id, fields);
      logger.info('[Actual] accountGroupUpdate completed', { groupId: id });
    },
    { mode: 'write' }
  );
};

export const accountGroupDelete = async (id) => {
  return runWithApi(
    'accountGroupDelete',
    async (apiInstance) => {
      logger.debug('[Actual] Deleting account group', { groupId: id });
      await apiInstance.deleteAccountGroup(id);
      logger.info('[Actual] accountGroupDelete completed', { groupId: id });
    },
    { mode: 'write' }
  );
};
