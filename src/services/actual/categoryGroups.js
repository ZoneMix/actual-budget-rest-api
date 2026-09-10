/**
 * Category group operations against the Actual engine.
 */

import logger from '../../logging/logger.js';
import { runWithApi } from './runner.js';

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
    { mode: 'write' }
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
    { mode: 'write' }
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
    { mode: 'write' }
  );
};
