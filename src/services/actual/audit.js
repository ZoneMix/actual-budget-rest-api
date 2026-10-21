/**
 * The day's Actual sync changes, for GET /v1/audit/changes.
 *
 * Runs as a READ through the engine queue: the sync policy brings the local
 * copy up to date first, and no engine write can interleave with the scan.
 * The scan itself bypasses the SDK and reads `messages_crdt` over a read-only
 * SQLite connection (src/services/audit/reader.js), because no SDK method
 * exposes the change log. Nothing here writes to the budget.
 */

import { DATA_DIR, ACTUAL_SYNC_ID } from '../../config/index.js';
import auditConfig from '../../config/audit.js';
import logger from '../../logging/logger.js';
import { runWithApi } from './runner.js';
import { localDate, dayWindow } from '../audit/window.js';
import { locateBudgetDb, readWindow } from '../audit/reader.js';
import { createRedactor, secretEnvValues } from '../audit/redact.js';
import { toChange, buildReport } from '../audit/report.js';

const isSecret = createRedactor(secretEnvValues(process.env));

/**
 * @param {{ date?: string, limit: number, offset: number }} query - validated
 * @param {{ now?: Date }} [options] - clock override for tests
 */
export const auditChangesGet = async ({ date, limit, offset }, { now = new Date() } = {}) => {
  const { timeZone, clientLabels } = auditConfig;
  const day = date ?? localDate(now, timeZone);
  const window = dayWindow(day, timeZone);

  return runWithApi('auditChangesGet', async () => {
    const dbPath = locateBudgetDb(DATA_DIR, ACTUAL_SYNC_ID);
    const { messages, ownClientId } = readWindow(dbPath, window);
    const context = { clientLabels, ownClientId, isSecret };
    const changes = messages.map((message) => toChange(message, context));

    const undecodable = changes.filter((change) => change.at === null).length;
    if (undecodable > 0) {
      logger.warn('[Audit] Messages with an unparseable timestamp', { date: day, count: undecodable });
    }
    logger.info('[Actual] auditChangesGet result', { date: day, total: changes.length });
    return buildReport(changes, { date: day, timeZone, window, limit, offset });
  });
};
