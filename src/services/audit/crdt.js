/**
 * Decoding of Actual's CRDT message log (`messages_crdt`).
 *
 * Each row is one cell write: dataset (table), row id, column, value. The
 * timestamp is a hybrid logical clock, `<ISO time>-<4 hex counter>-<16 hex
 * client id>`, and the client id identifies the device or SDK instance that
 * made the change. Values carry a one-character type tag, mirroring
 * serializeValue/deserializeValue in @actual-app/api: `0:` null, `N:` number,
 * `S:` string. Amounts are integers in cents, exactly as Actual stores them.
 */

const HLC_PATTERN = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)-([0-9A-Fa-f]{4})-([0-9A-Fa-f]{16})$/;

/**
 * @param {string} timestamp - HLC string from messages_crdt.timestamp
 * @returns {{ at: string, counter: number, clientId: string } | null} null when malformed
 */
export const parseTimestamp = (timestamp) => {
  const match = HLC_PATTERN.exec(String(timestamp ?? ''));
  if (!match) return null;
  return {
    at: match[1],
    counter: Number.parseInt(match[2], 16),
    clientId: match[3].toLowerCase(),
  };
};

/**
 * @param {string|Buffer} raw - messages_crdt.value (a BLOB column; TEXT in practice)
 * @returns {{ value: null|number|string, ok: boolean }} ok=false keeps the raw text
 */
export const decodeValue = (raw) => {
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw ?? '');
  switch (text[0]) {
    case '0':
      return { value: null, ok: true };
    case 'N':
      return { value: Number.parseFloat(text.slice(2)), ok: true };
    case 'S':
      return { value: text.slice(2), ok: true };
    default:
      return { value: text, ok: false };
  }
};

/** Client id embedded in the serialized clock (`messages_clock.clock`), or null. */
export const clientIdFromClock = (clockJson) => {
  const parsed = JSON.parse(clockJson);
  return parseTimestamp(parsed?.timestamp)?.clientId ?? null;
};
