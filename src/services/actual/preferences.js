/**
 * Synced budget preferences (number format, currency, first day of week, …).
 *
 * `getPreferences()` resolves the engine's SyncedPrefs map (methods.d.ts:134).
 * The keys belong to the engine and grow between releases, so the object is
 * returned untouched rather than projected onto a fixed shape.
 */

import logger from '../../logging/logger.js';
import { runWithApi } from './runner.js';

export const preferencesGet = async () => {
  return runWithApi('preferencesGet', async (apiInstance) => {
    logger.debug('[Actual] Getting preferences');
    const preferences = await apiInstance.getPreferences();
    logger.info('[Actual] preferencesGet result', {
      keys: preferences ? Object.keys(preferences).length : 0,
    });
    return preferences;
  });
};
