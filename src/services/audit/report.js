/**
 * Turns raw CRDT messages into the GET /v1/audit/changes payload.
 * Pure: no I/O, no clock, so every rule here is unit-testable.
 */

import { AUDIT_SELF_LABEL } from '../../config/audit.js';
import { parseTimestamp, decodeValue } from './crdt.js';
import { REDACTED } from './redact.js';

/** The label for a client id: configured name, this API itself, or null. */
const sourceOf = (clientId, { clientLabels, ownClientId }) => {
  if (!clientId) return null;
  if (clientLabels.has(clientId)) return clientLabels.get(clientId);
  return clientId === ownClientId ? AUDIT_SELF_LABEL : null;
};

/**
 * @param {object} message - from readWindow()
 * @param {object} context - { clientLabels: Map, ownClientId, isSecret(names, value) }
 */
export const toChange = (message, context) => {
  const stamp = parseTimestamp(message.timestamp);
  const next = decodeValue(message.raw);
  const prev = message.previous ? decodeValue(message.previous.raw) : null;
  const names = [message.column, message.row];
  const redacted = context.isSecret(names, next.value)
    || (prev !== null && context.isSecret(names, prev.value));

  return {
    timestamp: message.timestamp,
    at: stamp?.at ?? null,
    table: message.dataset,
    rowId: message.row,
    column: message.column,
    oldValue: redacted && prev ? REDACTED : prev?.value ?? null,
    newValue: redacted ? REDACTED : next.value,
    oldValueAvailable: prev !== null,
    clientId: stamp?.clientId ?? null,
    source: sourceOf(stamp?.clientId, context),
    redacted,
  };
};

/** A CLIENTS_SQL row as the payload's summary.byClient entry. */
export const toClientSummary = (row, context) => ({
  clientId: row.clientId,
  source: sourceOf(row.clientId, context),
  changes: row.n,
  first: parseTimestamp(row.first)?.at ?? null,
  last: parseTimestamp(row.last)?.at ?? null,
});

/**
 * @param {{ changes: object[], total: number, tables: object[], clients: object[] }} page
 *   changes is the requested page; total, tables and clients cover the whole day
 * @param {{ date, timeZone, window, limit, offset }} meta
 */
export const buildReport = ({ changes, total, tables, clients }, { date, timeZone, window, limit, offset }) => ({
  date,
  timeZone,
  window,
  total,
  offset,
  limit,
  returned: changes.length,
  truncated: offset + changes.length < total,
  summary: {
    byTable: Object.fromEntries(tables.map((row) => [row.dataset, row.n])),
    byClient: clients,
  },
  changes,
});
