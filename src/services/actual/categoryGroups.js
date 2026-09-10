/**
 * Category group operations against the Actual engine.
 */

import logger from '../../logging/logger.js';
import { runWithApi } from './runner.js';

/**
 * Lists category groups, optionally including or excluding hidden ones.
 *
 * Same optional-argument rule as `categoriesList`: `getCategoryGroups(options?)`
 * (methods.d.ts:86) is called with no argument when no filter was requested.
 *
 * @param {object} [options]
 * @param {boolean} [options.hidden] - include (true) or exclude (false) hidden
 */
export const categoryGroupsList = async ({ hidden } = {}) => {
  return runWithApi('categoryGroupsList', async (apiInstance) => {
    logger.debug('[Actual] Getting category groups list', { hidden });
    const groups = hidden === undefined
      ? await apiInstance.getCategoryGroups()
      : await apiInstance.getCategoryGroups({ hidden });
    logger.info('[Actual] categoryGroupsList result', { count: groups.length, hidden });
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

/**
 * Deletes a category group, optionally moving its categories' transactions to
 * another category. `deleteCategoryGroup(id, transferCategoryId?)`
 * (methods.d.ts:91) — the second argument is omitted when not supplied.
 *
 * @param {string} id - category group to delete
 * @param {string} [transferCategoryId] - category to reassign transactions to
 */
export const categoryGroupDelete = async (id, transferCategoryId) => {
  return runWithApi(
    'categoryGroupDelete',
    async (apiInstance) => {
      logger.debug('[Actual] Deleting category group', { groupId: id, transferCategoryId });
      if (transferCategoryId === undefined) {
        await apiInstance.deleteCategoryGroup(id);
      } else {
        await apiInstance.deleteCategoryGroup(id, transferCategoryId);
      }
      logger.info('[Actual] categoryGroupDelete completed', { groupId: id, transferCategoryId });
    },
    { mode: 'write' }
  );
};
