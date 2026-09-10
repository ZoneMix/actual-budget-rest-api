/**
 * Cross-cutting engine lookups that do not belong to a single domain.
 */

import logger from '../../logging/logger.js';
import { NotFoundError, isEngineNotFound } from '../../errors/index.js';
import { runWithApi } from './runner.js';
import { syncPolicy } from './syncPolicy.js';

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
    try {
      const id = await apiInstance.getIDByName(type, name);
      logger.info('[Actual] getIdByName result', { type, name, id });
      return id;
    } catch (error) {
      // A miss is a 404, not the 400 every other APIError maps to. The engine
      // never resolves null here, so the caller cannot detect it any other way.
      if (isEngineNotFound(error)) {
        logger.info('[Actual] getIdByName found no match', { type, name });
        throw new NotFoundError(error.message.replace(/^Not found:\s*/, ''));
      }
      throw error;
    }
  });
};

/**
 * Syncs with the Actual server on demand.
 *
 * The work is done by the runner's forced pre-read sync, not by the callback:
 * `{ mode: 'read', force: true }` makes `runWithApi` call `instance.sync()`
 * before the callback runs, with the budget-recovery retry and the policy
 * bookkeeping that go with it. Calling `sync()` again inside the callback would
 * be a second, pointless round trip.
 *
 * @returns {Promise<string|null>} ISO timestamp of the sync, null if unrecorded
 */
export const syncNow = async () => {
  await runWithApi(
    'syncNow',
    async () => {
      logger.debug('[Actual] On-demand sync requested');
    },
    { mode: 'read', force: true }
  );

  const lastSyncAt = syncPolicy.lastSyncAt();
  const syncedAt = lastSyncAt === null ? null : new Date(lastSyncAt).toISOString();
  logger.info('[Actual] syncNow completed', { syncedAt });
  return syncedAt;
};

/**
 * Asks the Actual server for its version.
 *
 * Returns the engine's union result unchanged — `{ version }` on success,
 * `{ error: 'no-server' | 'network-failure' }` when the server is unreachable.
 * Mapping the failure arm onto an HTTP status is the caller's job, because
 * /v2/server/version answers 502 while /v2/health only records a null.
 *
 * @returns {Promise<{version: string}|{error: string}>} engine result
 */
export const serverVersion = async () => {
  return runWithApi('serverVersion', async (apiInstance) => {
    logger.debug('[Actual] Getting server version');
    const result = await apiInstance.getServerVersion();
    logger.info('[Actual] serverVersion result', { version: result?.version, error: result?.error });
    return result;
  });
};
