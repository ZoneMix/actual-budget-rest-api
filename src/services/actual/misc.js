/**
 * Cross-cutting engine lookups that do not belong to a single domain.
 */

import logger from '../../logging/logger.js';
import { runWithApi } from './runner.js';

/**
 * Resolves an entity id from its name.
 *
 * The SDK takes the two values positionally — getIDByName(type, name)
 * (@actual-app/api/@types/methods.d.ts:125, dist/index.js:130671) — and builds
 * the `{ type, name }` payload itself. Passing the object made `type` the
 * whole object and left `name` undefined.
 */
export const getIdByName = async (type, name) => {
  return runWithApi('getIdByName', async (apiInstance) => {
    logger.debug('[Actual] Getting ID by name', { type, name });
    const id = await apiInstance.getIDByName(type, name);
    logger.info('[Actual] getIdByName result', { type, name, id });
    return id;
  });
};
