/**
 * Test helper: a local budget directory shaped like the SDK's cache.
 *
 *   <dataDir>/<name>/metadata.json   { groupId }
 *   <dataDir>/<name>/db.sqlite       messages_crdt + messages_clock, same DDL
 *                                    and index as a real Actual budget file
 */

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const SCHEMA = [
  `CREATE TABLE messages_crdt (id INTEGER PRIMARY KEY, timestamp TEXT NOT NULL UNIQUE,
    dataset TEXT NOT NULL, row TEXT NOT NULL, column TEXT NOT NULL, value BLOB NOT NULL)`,
  'CREATE INDEX messages_crdt_search ON messages_crdt(dataset, row, column, timestamp)',
  'CREATE TABLE messages_clock (id INTEGER PRIMARY KEY, clock TEXT)',
];

/** HLC timestamp for an ISO instant: `<iso>-<counter>-<clientId>`. */
export const hlc = (iso, clientId, counter = 0) =>
  `${new Date(iso).toISOString()}-${counter.toString(16).toUpperCase().padStart(4, '0')}-${clientId}`;

/** Actual's value encoding: 0: null, N: number, S: string. */
export const encode = (value) => {
  if (value === null) return '0:';
  if (typeof value === 'number') return `N:${value}`;
  return `S:${value}`;
};

/**
 * @param {string} dataDir
 * @param {object} options
 * @param {string} options.groupId - matches ACTUAL_SYNC_ID for the copy to be found
 * @param {Array<[string, string, string, string, *]>} options.messages - [timestamp, dataset, row, column, value]
 * @param {string} [options.ownClientId] - written into messages_clock
 * @param {string} [options.name]
 * @returns {{ dir: string, dbPath: string }}
 */
export const createBudgetFixture = (dataDir, { groupId, messages, ownClientId, name = 'Test-Budget-abc1234' }) => {
  const dir = path.join(dataDir, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify({ id: name, groupId }));

  const dbPath = path.join(dir, 'db.sqlite');
  const db = new Database(dbPath);
  try {
    SCHEMA.forEach((sql) => db.exec(sql));
    const insert = db.prepare('INSERT INTO messages_crdt (timestamp, dataset, row, column, value) VALUES (?, ?, ?, ?, ?)');
    messages.forEach(([timestamp, dataset, row, column, value]) => insert.run(timestamp, dataset, row, column, encode(value)));
    if (ownClientId) {
      const clock = { timestamp: hlc('2026-10-21T00:00:00.000Z', ownClientId), merkle: {} };
      db.prepare('INSERT INTO messages_clock (id, clock) VALUES (1, ?)').run(JSON.stringify(clock));
    }
  } finally {
    db.close();
  }
  return { dir, dbPath };
};
