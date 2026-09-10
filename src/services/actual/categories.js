/**
 * Category operations against the Actual engine.
 */

import logger from '../../logging/logger.js';
import { runWithApi } from './runner.js';

export const categoriesList = async () => {
  return runWithApi('categoriesList', async (apiInstance) => {
    logger.debug('[Actual] Getting categories list');
    const categories = await apiInstance.getCategories();
    logger.info('[Actual] categoriesList result', { count: categories.length });
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

export const categoryDelete = async (id) => {
  return runWithApi(
    'categoryDelete',
    async (apiInstance) => {
      logger.debug('[Actual] Deleting category', { categoryId: id });
      const result = await apiInstance.deleteCategory(id);
      logger.info('[Actual] categoryDelete completed', { categoryId: id, result });
      return result;
    },
    { mode: 'write' }
  );
};
