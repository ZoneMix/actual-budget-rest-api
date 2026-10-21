/**
 * The CRDT reader and report builder, against a real SQLite budget fixture.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { locateBudgetDb, readWindow } from '../../src/services/audit/reader.js';
import { toChange, toClientSummary, buildReport } from '../../src/services/audit/report.js';
import { createRedactor } from '../../src/services/audit/redact.js';
import { createBudgetFixture, hlc } from '../helpers/auditFixture.js';

const GROUP = 'group-under-test';
const OWN = '3d4e5f60718293a4';
const PHONE = '2c3d4e5f60718293';
const SYNC = '0a1b2c3d4e5f6071';
const WINDOW = { start: '2026-10-19T05:00:00.000Z', end: '2026-10-20T05:00:00.000Z' };
const PLANTED = 'leaked-secret-value-0123';
const PAGE_ALL = { limit: 100, offset: 0 };

const MESSAGES = [
  [hlc('2026-10-18T20:00:00.000Z', SYNC), 'transactions', 'txn-1', 'amount', -1000],
  [hlc(WINDOW.start, PHONE), 'transactions', 'txn-3', 'cleared', 1],
  [hlc('2026-10-19T12:00:00.000Z', PHONE), 'transactions', 'txn-1', 'amount', -1250],
  [hlc('2026-10-19T13:00:00.000Z', OWN), 'transactions', 'txn-1', 'amount', -1300],
  [hlc('2026-10-19T14:00:00.000Z', PHONE), 'transactions', 'txn-2', 'notes', 'Costco run'],
  [hlc('2026-10-19T15:00:00.000Z', SYNC), 'categories', 'cat-1', 'hidden', null],
  [hlc('2026-10-19T16:00:00.000Z', SYNC), 'transactions', 'txn-2', 'notes', `oops ${PLANTED}`],
  [hlc(WINDOW.end, PHONE), 'transactions', 'txn-1', 'amount', -9999],
];

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

describe('audit reader', () => {
  let dataDir;
  let dbPath;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-reader-'));
    ({ dbPath } = createBudgetFixture(dataDir, { groupId: GROUP, messages: MESSAGES, ownClientId: OWN }));
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('locates the budget by groupId and skips unrelated directories', () => {
    fs.mkdirSync(path.join(dataDir, 'not-a-budget'));
    fs.mkdirSync(path.join(dataDir, 'broken-metadata'));
    fs.writeFileSync(path.join(dataDir, 'broken-metadata', 'metadata.json'), '{');
    createBudgetFixture(dataDir, { groupId: 'another-group', messages: [], name: 'Other-Budget' });

    expect(locateBudgetDb(dataDir, GROUP)).toBe(dbPath);
  });

  it('answers 503 when the budget is not downloaded', () => {
    expect(() => locateBudgetDb(dataDir, 'missing-group')).toThrow(expect.objectContaining({ status: 503 }));
  });

  it('answers 503 without naming the path when DATA_DIR is unreadable', () => {
    const missing = path.join(dataDir, 'does-not-exist');
    expect(() => locateBudgetDb(missing, GROUP)).toThrow(expect.objectContaining({ status: 503 }));
    try {
      locateBudgetDb(missing, GROUP);
    } catch (error) {
      expect(error.message).not.toContain(missing);
    }
  });

  it('prefers the most recently written copy when there are two', () => {
    const { dbPath: newer } = createBudgetFixture(dataDir, { groupId: GROUP, messages: [], name: 'Copy-Two' });
    const past = new Date('2026-01-01T00:00:00Z');
    fs.utimesSync(dbPath, past, past);

    expect(locateBudgetDb(dataDir, GROUP)).toBe(newer);
  });

  it('returns the window only, oldest first, with each superseded value', () => {
    const { messages, ownClientId } = readWindow(dbPath, WINDOW, PAGE_ALL);

    expect(ownClientId).toBe(OWN);
    expect(messages.map((m) => m.timestamp.slice(0, 24))).toEqual([
      WINDOW.start,
      '2026-10-19T12:00:00.000Z',
      '2026-10-19T13:00:00.000Z',
      '2026-10-19T14:00:00.000Z',
      '2026-10-19T15:00:00.000Z',
      '2026-10-19T16:00:00.000Z',
    ]);
    // Prior value from before the window, then from inside it.
    expect(messages[1].previous).toEqual({ raw: 'N:-1000' });
    expect(messages[2].previous).toEqual({ raw: 'N:-1250' });
    // First write to a cell has nothing to supersede.
    expect(messages[3].previous).toBeNull();
  });

  it('never writes to the budget file', () => {
    const before = sha256(dbPath);
    readWindow(dbPath, WINDOW, PAGE_ALL);
    expect(sha256(dbPath)).toBe(before);
    expect(fs.existsSync(`${dbPath}-journal`)).toBe(false);
  });

  it('builds changes with decoded values, sources and redaction', () => {
    const { messages, ownClientId } = readWindow(dbPath, WINDOW, PAGE_ALL);
    const context = {
      clientLabels: new Map([[SYNC, 'strike-sync']]),
      ownClientId,
      isSecret: createRedactor([PLANTED]),
    };
    const changes = messages.map((m) => toChange(m, context));

    expect(changes[1]).toEqual({
      timestamp: hlc('2026-10-19T12:00:00.000Z', PHONE),
      at: '2026-10-19T12:00:00.000Z',
      table: 'transactions',
      rowId: 'txn-1',
      column: 'amount',
      oldValue: -1000,
      newValue: -1250,
      oldValueAvailable: true,
      clientId: PHONE,
      source: null,
      redacted: false,
    });
    expect(changes[2].source).toBe('actual-rest-api');
    expect(changes[3]).toMatchObject({ oldValue: null, oldValueAvailable: false, newValue: 'Costco run' });
    expect(changes[4]).toMatchObject({ newValue: null, source: 'strike-sync' });
    // The secret is withheld, and so is the old value of the same write.
    expect(changes[5]).toMatchObject({ newValue: '[redacted]', oldValue: '[redacted]', redacted: true });
    expect(JSON.stringify(changes)).not.toContain(PLANTED);
  });

  it('pages in SQL while totals and summaries cover the whole day', () => {
    const full = readWindow(dbPath, WINDOW, PAGE_ALL);
    const page = readWindow(dbPath, WINDOW, { limit: 2, offset: 2 });

    expect(page.messages).toEqual(full.messages.slice(2, 4));
    // The superseded value still resolves when it sits outside the page.
    expect(page.messages[0].previous).toEqual({ raw: 'N:-1250' });
    expect(page.total).toBe(6);
    expect(page.tables).toEqual([{ dataset: 'transactions', n: 5 }, { dataset: 'categories', n: 1 }]);
    expect(page.clients[0]).toEqual({
      clientId: PHONE,
      n: 3,
      first: hlc(WINDOW.start, PHONE),
      last: hlc('2026-10-19T14:00:00.000Z', PHONE),
    });
  });

  it('builds the report from a page and the day aggregates', () => {
    const { messages, total, tables, clients, ownClientId } = readWindow(dbPath, WINDOW, { limit: 2, offset: 1 });
    const context = { clientLabels: new Map([[SYNC, 'strike-sync']]), ownClientId, isSecret: () => false };
    const changes = messages.map((m) => toChange(m, context));
    const byClient = clients.map((row) => toClientSummary(row, context));
    const meta = { date: '2026-10-19', timeZone: 'America/Chicago', window: WINDOW, limit: 2, offset: 1 };

    const report = buildReport({ changes, total, tables, clients: byClient }, meta);

    expect(report).toMatchObject({ total: 6, returned: 2, offset: 1, limit: 2, truncated: true });
    expect(report.summary.byTable).toEqual({ transactions: 5, categories: 1 });
    expect(report.summary.byClient).toEqual([
      { clientId: PHONE, source: null, changes: 3, first: WINDOW.start, last: '2026-10-19T14:00:00.000Z' },
      { clientId: SYNC, source: 'strike-sync', changes: 2, first: '2026-10-19T15:00:00.000Z', last: '2026-10-19T16:00:00.000Z' },
      { clientId: OWN, source: 'actual-rest-api', changes: 1, first: '2026-10-19T13:00:00.000Z', last: '2026-10-19T13:00:00.000Z' },
    ]);
    const lastPage = buildReport({ changes, total, tables, clients: byClient }, { ...meta, offset: 4 });
    expect(lastPage.truncated).toBe(false);
  });
});
