/**
 * Note operations against the Actual engine.
 *
 * A note is addressed by the id of the entity it annotates — an account,
 * category, payee or schedule — so there is no separate note id and no create
 * call: `updateNote` writes one, and passing `null` clears it
 * (methods.d.ts:98-99).
 */

import logger from '../../logging/logger.js';
import { runWithApi } from './runner.js';

export const noteGet = async (id) => {
  return runWithApi('noteGet', async (apiInstance) => {
    logger.debug('[Actual] Getting note', { entityId: id });
    const note = await apiInstance.getNote(id);
    logger.info('[Actual] noteGet result', { entityId: id, found: note !== null && note !== undefined });
    return note ?? null;
  });
};

export const noteUpdate = async (id, note) => {
  return runWithApi(
    'noteUpdate',
    async (apiInstance) => {
      logger.debug('[Actual] Updating note', { entityId: id, cleared: note === null });
      await apiInstance.updateNote(id, note);
      logger.info('[Actual] noteUpdate completed', { entityId: id });
    },
    { mode: 'write' }
  );
};
