/**
 * Read-only access to the local budget copy's CRDT log.
 *
 * The SDK keeps the open budget under DATA_DIR/<local id>/db.sqlite, and its
 * `messages_crdt` table records every synced cell write from every client.
 * This module opens that file with a SEPARATE connection that SQLite itself
 * refuses to write through (`readonly` plus `PRAGMA query_only`), so no code
 * path here can change Actual data.
 */

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { ServiceUnavailableError } from '../../errors/index.js';
import logger from '../../logging/logger.js';
import { clientIdFromClock } from './crdt.js';

const DB_FILE = 'db.sqlite';
const METADATA_FILE = 'metadata.json';
const BUSY_TIMEOUT_MS = 5000;

// The window query walks the UNIQUE(timestamp) index; the prior-value lookup
// walks messages_crdt_search (dataset, row, column, timestamp).
const WINDOW_SQL = `SELECT timestamp, dataset, row, "column" AS col, value
  FROM messages_crdt WHERE timestamp >= ? AND timestamp < ? ORDER BY timestamp`;
const PRIOR_SQL = `SELECT value FROM messages_crdt
  WHERE dataset = ? AND row = ? AND "column" = ? AND timestamp < ?
  ORDER BY timestamp DESC LIMIT 1`;
const CLOCK_SQL = 'SELECT clock FROM messages_clock LIMIT 1';

/** groupId from a budget directory's metadata.json; null when it has none. */
const readGroupId = (dir) => {
  const file = path.join(dir, METADATA_FILE);
  // Paths come from DATA_DIR and its own directory entries, never from a request.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (!fs.existsSync(file)) return null;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    return JSON.parse(fs.readFileSync(file, 'utf8')).groupId ?? null;
  } catch (error) {
    logger.warn('[Audit] Unreadable budget metadata skipped', { dir: path.basename(dir), error: error.message });
    return null;
  }
};

/**
 * Finds the local db.sqlite of the budget synced as `syncId`, the same lookup
 * the SDK's downloadBudget does (local budget whose groupId matches). Several
 * matches resolve to the most recently written file.
 */
/** DATA_DIR entries; a failure is reported without the path, which is an env value. */
const listDataDir = (dataDir) => {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    return fs.readdirSync(dataDir, { withFileTypes: true });
  } catch (error) {
    logger.error('[Audit] DATA_DIR is not readable', { code: error.code });
    throw new ServiceUnavailableError('The budget cache is not readable on this server');
  }
};

export const locateBudgetDb = (dataDir, syncId) => {
  const candidates = listDataDir(dataDir)
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(dataDir, entry.name))
    .filter((dir) => readGroupId(dir) === syncId)
    .map((dir) => path.join(dir, DB_FILE))
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    .filter((file) => fs.existsSync(file))
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    .map((file) => ({ file, mtimeMs: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (candidates.length === 0) {
    throw new ServiceUnavailableError('The budget has not been downloaded to this server yet');
  }
  if (candidates.length > 1) {
    logger.warn('[Audit] Several local copies of the budget; reading the newest', { copies: candidates.length });
  }
  return candidates[0].file;
};

const readOwnClientId = (db) => {
  const row = db.prepare(CLOCK_SQL).get();
  if (!row) return null;
  try {
    return clientIdFromClock(row.clock);
  } catch (error) {
    logger.warn('[Audit] messages_clock is unreadable; own client id unknown', { error: error.message });
    return null;
  }
};

/**
 * Every message in [window.start, window.end), oldest first, each paired with
 * the message it superseded: the latest earlier write to the same cell.
 *
 * @returns {{ messages: object[], ownClientId: string|null }}
 *   message: { timestamp, dataset, row, column, raw, previous: { raw }|null }
 */
export const readWindow = (dbPath, window) => {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true, timeout: BUSY_TIMEOUT_MS });
  try {
    db.pragma('query_only = ON');
    const rows = db.prepare(WINDOW_SQL).all(window.start, window.end);
    const prior = db.prepare(PRIOR_SQL);
    const lastWrite = new Map();

    const messages = rows.map((row) => {
      const cell = JSON.stringify([row.dataset, row.row, row.col]);
      const previous = lastWrite.has(cell)
        ? lastWrite.get(cell)
        : prior.get(row.dataset, row.row, row.col, row.timestamp)?.value;
      lastWrite.set(cell, row.value);
      return {
        timestamp: row.timestamp,
        dataset: row.dataset,
        row: row.row,
        column: row.col,
        raw: row.value,
        previous: previous === undefined ? null : { raw: previous },
      };
    });

    return { messages, ownClientId: readOwnClientId(db) };
  } finally {
    db.close();
  }
};
