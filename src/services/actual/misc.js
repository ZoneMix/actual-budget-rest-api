/**
 * Cross-cutting engine lookups that do not belong to a single domain.
 */

import logger from '../../logging/logger.js';
import { runWithApi } from './runner.js';

export const getIdByName = async (type, name) => {
  return runWithApi('getIdByName', async (apiInstance) => {
    logger.debug('[Actual] Getting ID by name', { type, name });
    const id = await apiInstance.getIDByName({ type, name });
    logger.info('[Actual] getIdByName result', { type, name, id });
    return id;
  });
};
