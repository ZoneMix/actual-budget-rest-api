/**
 * Budget-file operations: which files exist, which one is open, and moving the
 * whole ledger in or out as a zip.
 *
 * These are the widest-blast-radius calls in the SDK — loading swaps the open
 * budget for the entire process, importing replaces it — so the routes above
 * them are admin-gated and `budgetImport` has no route at all.
 */

import { ACTUAL_LOAD_TIMEOUT_MS } from '../../config/index.js';
import logger from '../../logging/logger.js';
import { runWithApi } from './runner.js';
import { syncPolicy } from './syncPolicy.js';

export const budgetFilesList = async () => {
  return runWithApi('budgetFilesList', async (apiInstance) => {
    logger.debug('[Actual] Getting budget files list');
    const files = await apiInstance.getBudgets();
    logger.info('[Actual] budgetFilesList result', { count: files.length });
    return files;
  });
};

/**
 * Opens a different budget file for the whole process.
 *
 * The post-write sync leaves the policy marked fresh, but that freshness was
 * measured against the file that is no longer open — so the policy is forced
 * stale afterwards and the next read re-syncs against the new file.
 *
 * @param {string} budgetId - id from `budgetFilesList()`
 * @returns {Promise<string>} the id that was loaded
 */
export const budgetLoad = async (budgetId) => {
  await runWithApi(
    'budgetLoad',
    async (apiInstance) => {
      logger.debug('[Actual] Loading budget file', { budgetId });
      await apiInstance.loadBudget(budgetId);
      logger.info('[Actual] budgetLoad completed', { budgetId });
    },
    // Its own, longer budget: this call pulls a whole budget file over the
    // network. ACTUAL_OP_TIMEOUT_MS would reject the caller while the engine
    // kept the queue slot until it finished anyway (queue.js `withTimeout`),
    // which is the realistic way to wedge the queue.
    { mode: 'write', timeoutMs: ACTUAL_LOAD_TIMEOUT_MS }
  );

  syncPolicy.forceStale();
  return budgetId;
};

/**
 * Exports the open budget as zip bytes.
 *
 * Returns the `Uint8Array` untouched: the caller streams it, and turning it
 * into base64 for a JSON envelope would inflate the whole ledger by a third
 * for no benefit.
 *
 * @returns {Promise<Uint8Array>} zip archive bytes
 */
export const budgetExport = async () => {
  return runWithApi(
    'budgetExport',
    async (apiInstance) => {
      logger.debug('[Actual] Exporting budget');
      const bytes = await apiInstance.exportBudget();
      logger.info('[Actual] budgetExport result', { byteLength: bytes?.length ?? 0 });
      return bytes;
    },
    // Same reasoning as budgetLoad: zipping the whole ledger is slow enough to
    // outrun the ordinary per-operation timeout.
    { timeoutMs: ACTUAL_LOAD_TIMEOUT_MS }
  );
};

/**
 * Imports a budget from an Actual `.zip` or a YNAB4/YNAB5 export and loads it.
 *
 * DELIBERATELY UNEXPOSED: there is no route for this. Importing discards the
 * ledger the wrapper is currently serving, which is not something an API token
 * should be able to do by accident. `ENABLE_BUDGET_IMPORT` is reserved as the
 * flag that would gate a future route; until then this exists so the call shape
 * is pinned by tests rather than rediscovered later.
 *
 * @param {string|ArrayBuffer|Uint8Array} input - file path or raw contents
 * @param {object} [opts] - `{ type, filename }` per the SDK signature
 * @returns {Promise<{id: string}>} the imported budget's id
 */
export const budgetImport = async (input, opts) => {
  return runWithApi(
    'budgetImport',
    async (apiInstance) => {
      logger.debug('[Actual] Importing budget', { type: opts?.type, filename: opts?.filename });
      const result = await apiInstance.importBudget(input, opts);
      logger.info('[Actual] budgetImport completed', { budgetId: result?.id });
      return result;
    },
    { mode: 'write' }
  );
};
