/**
 * Category operations against the Actual engine.
 */

import logger from '../../logging/logger.js';
import { runWithApi } from './runner.js';

/**
 * Lists categories, optionally including or excluding hidden ones.
 *
 * `getCategories(options?)` (methods.d.ts:92) takes an OPTIONAL options object.
 * With no `hidden` filter the argument is omitted entirely rather than passed
 * as `undefined`, so the call shape stays exactly what it was before the
 * filter existed.
 *
 * @param {object} [options]
 * @param {boolean} [options.hidden] - include (true) or exclude (false) hidden
 */
export const categoriesList = async ({ hidden } = {}) => {
  return runWithApi('categoriesList', async (apiInstance) => {
    logger.debug('[Actual] Getting categories list', { hidden });
    const categories = hidden === undefined
      ? await apiInstance.getCategories()
      : await apiInstance.getCategories({ hidden });
    logger.info('[Actual] categoriesList result', { count: categories.length, hidden });
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
    { mode: 'write' }
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
    { mode: 'write' }
  );
};

/**
 * Deletes a category, optionally moving its transactions to another one.
 *
 * `deleteCategory(id, transferCategoryId?)` (methods.d.ts:97): without the
 * second argument the engine leaves the transactions uncategorised, so it is
 * omitted rather than passed as `undefined`.
 *
 * @param {string} id - category to delete
 * @param {string} [transferCategoryId] - category to reassign transactions to
 */
export const categoryDelete = async (id, transferCategoryId) => {
  return runWithApi(
    'categoryDelete',
    async (apiInstance) => {
      logger.debug('[Actual] Deleting category', { categoryId: id, transferCategoryId });
      const result = transferCategoryId === undefined
        ? await apiInstance.deleteCategory(id)
        : await apiInstance.deleteCategory(id, transferCategoryId);
      logger.info('[Actual] categoryDelete completed', { categoryId: id, transferCategoryId, result });
      return result;
    },
    { mode: 'write' }
  );
};
