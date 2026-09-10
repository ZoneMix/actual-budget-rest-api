/**
 * Ad-hoc ActualQL queries against the Actual engine.
 */

import logger from '../../logging/logger.js';
import { runWithApi } from './runner.js';

export const runActualQuery = async (query) => {
  return runWithApi('runActualQuery', async (apiInstance) => {
    logger.debug('[Actual] Running query', { table: query.table });
    const result = await apiInstance.runQuery({ query });
    logger.info('[Actual] runActualQuery completed', {
      table: query.table,
      resultCount: Array.isArray(result) ? result.length : 'non-array'
    });
    return result;
  });
};
