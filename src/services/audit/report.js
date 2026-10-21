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
 * @param {object} context - { clientLabels: Map, ownClientId, isSecret(column, value) }
 */
export const toChange = (message, context) => {
  const stamp = parseTimestamp(message.timestamp);
  const next = decodeValue(message.raw);
  const prev = message.previous ? decodeValue(message.previous.raw) : null;
  const redacted = context.isSecret(message.column, next.value)
    || (prev !== null && context.isSecret(message.column, prev.value));

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

const countBy = (items, keyOf) =>
  items.reduce((counts, item) => {
    const key = keyOf(item);
    return new Map(counts).set(key, (counts.get(key) ?? 0) + 1);
  }, new Map());

const clientSummary = (changes) => {
  const byClient = changes.reduce((clients, change) => {
    const seen = clients.get(change.clientId);
    const entry = seen
      ? { ...seen, changes: seen.changes + 1, last: change.at }
      : { clientId: change.clientId, source: change.source, changes: 1, first: change.at, last: change.at };
    return new Map(clients).set(change.clientId, entry);
  }, new Map());
  return [...byClient.values()].sort((a, b) => b.changes - a.changes);
};

/**
 * @param {object[]} changes - every change of the day, oldest first
 * @param {{ date, timeZone, window, limit, offset }} meta
 */
export const buildReport = (changes, { date, timeZone, window, limit, offset }) => {
  const page = changes.slice(offset, offset + limit);
  const byTable = [...countBy(changes, (change) => change.table)].sort((a, b) => b[1] - a[1]);
  return {
    date,
    timeZone,
    window,
    total: changes.length,
    offset,
    limit,
    returned: page.length,
    truncated: offset + page.length < changes.length,
    summary: {
      byTable: Object.fromEntries(byTable),
      byClient: clientSummary(changes),
    },
    changes: page,
  };
};
