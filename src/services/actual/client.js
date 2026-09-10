/**
 * Actual Budget engine client: initialization, lifecycle and budget recovery.
 *
 * `@actual-app/api` is a stateful singleton — one process, one open budget
 * file — so the instance is cached here and every other module in this folder
 * borrows it rather than importing the SDK directly.
 */

import {
  DATA_DIR,
  ACTUAL_SERVER_URL,
  ACTUAL_PASSWORD,
  ACTUAL_SYNC_ID,
  ACTUAL_FILE_PASSWORD,
} from '../../config/index.js';
import logger from '../../logging/logger.js';

let api = null;
// `api` is assigned before init() runs, so it is NOT a readiness signal on its
// own. This flips only once init() AND the budget download have succeeded, and
// back on failure or shutdown.
let ready = false;

/**
 * Downloads the budget, passing the E2E encryption password only when one is
 * configured — `@actual-app/api` treats an explicit `undefined` password
 * differently from an omitted options argument.
 */
const downloadBudget = async (instance) => {
  if (ACTUAL_FILE_PASSWORD) {
    return instance.downloadBudget(ACTUAL_SYNC_ID, { password: ACTUAL_FILE_PASSWORD });
  }
  return instance.downloadBudget(ACTUAL_SYNC_ID);
};

/**
 * Initialize the Actual API client (idempotent).
 */
export const initActualApi = async () => {
  if (api) return api;

  const { default: actualApi } = await import('@actual-app/api');
  api = actualApi;

  logger.info('Initializing Actual Budget API client...');
  try {
    await api.init({
      dataDir: DATA_DIR,
      serverURL: ACTUAL_SERVER_URL,
      password: ACTUAL_PASSWORD,
    });

    logger.info('Downloading budget...', { syncId: ACTUAL_SYNC_ID });
    await downloadBudget(api);
    ready = true;
    logger.info('Actual API initialized and budget downloaded.');
  } catch (error) {
    logger.error('Failed to initialize Actual API', {
      error: error.message,
      stack: error.stack,
    });
    api = null; // Reset on failure so retry can happen
    ready = false;
    throw error;
  }

  return api;
};

/**
 * Get the initialized API instance, initializing it if it is not up yet.
 */
export const getActualApi = async () => {
  if (!api) await initActualApi();
  return api;
};

/**
 * The instance ONLY if initialization already completed, otherwise null.
 *
 * For callers that must observe the engine without driving it — GET /v2/health
 * above all, which is unauthenticated and polled by the Dockerfile HEALTHCHECK
 * every 30 s. Calling `getActualApi()` there would let an anonymous request
 * trigger `init()` and a full budget download.
 *
 * @returns {object|null} the engine instance, or null when it is not ready
 */
export const getActualApiIfReady = () => (ready ? api : null);

/**
 * Graceful shutdown.
 */
export const shutdownActualApi = async () => {
  if (api) {
    ready = false;
    await api.shutdown();
    logger.info('Actual API shutdown complete.');
    api = null;
  }
};

/**
 * Re-download the budget and retry the sync.
 *
 * A sync that fails inside `getPrefs` means the engine has no budget loaded —
 * usually the server restarted under us. Re-downloading is the only recovery.
 *
 * @param {object} instance - the engine instance whose sync failed
 * @param {Error} originalError - the sync error that triggered recovery
 */
export const recoverBudget = async (instance, originalError) => {
  logger.warn('[Actual] Budget may not be loaded, attempting to re-download...');
  try {
    await downloadBudget(instance);
    await instance.sync(); // Retry sync after re-download
    logger.info('[Actual] Budget re-downloaded and synced successfully');
  } catch (retryError) {
    logger.error('[Actual] Retry failed after re-download', {
      error: retryError.message,
    });
    throw new Error(`Budget synchronization failed. The budget may not be properly initialized. Please verify ACTUAL_SYNC_ID (${ACTUAL_SYNC_ID}) is correct and the Actual Budget server is accessible. Original error: ${originalError.message}`);
  }
};
