/**
 * Pure helpers behind GET /v1/audit/changes: day windows, CRDT decoding and
 * redaction.
 */

import { dayWindow, localDate } from '../../src/services/audit/window.js';
import { parseTimestamp, decodeValue, clientIdFromClock } from '../../src/services/audit/crdt.js';
import { createRedactor, secretEnvValues } from '../../src/services/audit/redact.js';

const CHICAGO = 'America/Chicago';

describe('dayWindow', () => {
  it('maps a CDT day to [05:00Z, next 05:00Z)', () => {
    expect(dayWindow('2026-10-19', CHICAGO)).toEqual({
      start: '2026-10-19T05:00:00.000Z',
      end: '2026-10-20T05:00:00.000Z',
    });
  });

  it('maps a CST day to [06:00Z, next 06:00Z)', () => {
    expect(dayWindow('2026-12-31', CHICAGO)).toEqual({
      start: '2026-12-31T06:00:00.000Z',
      end: '2027-01-01T06:00:00.000Z',
    });
  });

  it('gives the fall-back day 25 hours and the spring-forward day 23', () => {
    const fallBack = dayWindow('2026-11-01', CHICAGO);
    const springForward = dayWindow('2026-03-08', CHICAGO);
    const hours = ({ start, end }) => (Date.parse(end) - Date.parse(start)) / 3600000;

    expect(fallBack).toEqual({ start: '2026-11-01T05:00:00.000Z', end: '2026-11-02T06:00:00.000Z' });
    expect(hours(fallBack)).toBe(25);
    expect(hours(springForward)).toBe(23);
  });

  it('handles UTC and half-hour zones', () => {
    expect(dayWindow('2026-10-19', 'UTC')).toEqual({ start: '2026-10-19T00:00:00.000Z', end: '2026-10-20T00:00:00.000Z' });
    expect(dayWindow('2026-10-19', 'Asia/Kolkata').start).toBe('2026-10-18T18:30:00.000Z');
  });
});

describe('localDate', () => {
  it('reports the Chicago calendar date, not the UTC one', () => {
    expect(localDate(new Date('2026-10-21T03:00:00Z'), CHICAGO)).toBe('2026-10-20');
    expect(localDate(new Date('2026-10-21T06:00:00Z'), CHICAGO)).toBe('2026-10-21');
  });
});

describe('parseTimestamp', () => {
  it('splits an HLC into time, counter and client id', () => {
    expect(parseTimestamp('2026-10-20T22:30:13.157Z-000A-0A1B2C3D4E5F6071')).toEqual({
      at: '2026-10-20T22:30:13.157Z',
      counter: 10,
      clientId: '0a1b2c3d4e5f6071',
    });
  });

  it('returns null for anything else', () => {
    expect(parseTimestamp('not-a-clock')).toBeNull();
    expect(parseTimestamp(undefined)).toBeNull();
  });
});

describe('decodeValue', () => {
  it('decodes the three Actual type tags', () => {
    expect(decodeValue('0:')).toEqual({ value: null, ok: true });
    expect(decodeValue('N:-12345')).toEqual({ value: -12345, ok: true });
    expect(decodeValue('S:Groceries')).toEqual({ value: 'Groceries', ok: true });
    expect(decodeValue('S:')).toEqual({ value: '', ok: true });
  });

  it('accepts a BLOB buffer', () => {
    expect(decodeValue(Buffer.from('N:4200'))).toEqual({ value: 4200, ok: true });
  });

  it('passes an unknown tag through as raw text, flagged', () => {
    expect(decodeValue('X:odd')).toEqual({ value: 'X:odd', ok: false });
  });
});

describe('clientIdFromClock', () => {
  it('reads the client id out of a serialized clock', () => {
    const clock = JSON.stringify({ timestamp: '2026-10-20T23:27:01.539Z-006D-3d4e5f60718293a4', merkle: {} });
    expect(clientIdFromClock(clock)).toBe('3d4e5f60718293a4');
  });

  it('throws on malformed JSON so the caller can report it', () => {
    expect(() => clientIdFromClock('{')).toThrow();
  });
});

describe('redaction', () => {
  const planted = 'super-secret-value-123';
  const isSecret = createRedactor([planted]);

  it('withholds secret-named columns whatever the value', () => {
    expect(isSecret(['access_token', 'row-1'], 'x')).toBe(true);
    expect(isSecret(['api_key', 'row-1'], 42)).toBe(true);
    expect(isSecret(['password', 'row-1'], null)).toBe(true);
  });

  it('withholds values that contain a known secret or look like one', () => {
    expect(isSecret(['notes', 'row-1'], `pasted ${planted} by mistake`)).toBe(true);
    expect(isSecret(['notes', 'row-1'], 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlLXZhbHVl')).toBe(true);
    expect(isSecret(['notes', 'row-1'], 'Bearer abcdefghijklmnopqrstuvwx')).toBe(true);
    expect(isSecret(['notes', 'row-1'], '-----BEGIN RSA PRIVATE KEY-----')).toBe(true);
  });

  it('leaves ordinary ledger data alone', () => {
    expect(isSecret(['notes', 'row-1'], 'Costco run')).toBe(false);
    expect(isSecret(['amount', 'row-1'], -4599)).toBe(false);
    expect(isSecret(['category', 'row-1'], null)).toBe(false);
  });

  it('collects only secret-bearing env values of a useful length', () => {
    const longValue = 'a-long-jwt-secret-value';
    const bearerValue = 'token-value-0123456789';
    const serverUrl = 'http://actual-server:5006';
    const values = secretEnvValues({
      JWT_SECRET: longValue,
      ACTUAL_PASSWORD: 'short',
      LEDGER_AUDIT_TOKEN: bearerValue,
      ACTUAL_SERVER_URL: serverUrl,
      NODE_ENV: 'production',
      PORT: '3000',
    });
    expect(values).toEqual(expect.arrayContaining([longValue, bearerValue, serverUrl]));
    expect(values).toContain('short');
    expect(values).not.toContain('production');
  });

  it('withholds a value whose row id names a secret (key/value tables)', () => {
    expect(isSecret(['value', 'sync.api_token'], 'anything')).toBe(true);
  });

  it('extracts the password embedded in a connection URL', () => {
    const embedded = 'pg-pass%40word';
    const values = secretEnvValues({ POSTGRES_URL: `postgresql://ledger:${embedded}@db:5432/auth` });
    expect(values).toEqual(expect.arrayContaining([embedded, 'pg-pass@word']));
    expect(createRedactor(values)(['notes'], 'see pg-pass@word')).toBe(true);
  });

  it('matches a short secret only as the whole value', () => {
    const redact = createRedactor(['abc12']);
    expect(redact(['notes'], 'abc12')).toBe(true);
    expect(redact(['notes'], 'abc123 groceries')).toBe(false);
  });
});
