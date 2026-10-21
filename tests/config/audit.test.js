/**
 * Audit configuration parsing (src/config/audit.js).
 */

import { parseAuditConfig, parseClientLabels, AUDIT_DEFAULT_TIMEZONE } from '../../src/config/audit.js';

const TOKEN = 'a'.repeat(64);

describe('parseAuditConfig', () => {
  it('defaults: no token, Chicago, no labels', () => {
    const config = parseAuditConfig({});
    expect(config.token).toBeNull();
    expect(config.timeZone).toBe(AUDIT_DEFAULT_TIMEZONE);
    expect(config.clientLabels.size).toBe(0);
  });

  it('treats an empty env-file entry as unset', () => {
    expect(parseAuditConfig({ LEDGER_AUDIT_TOKEN: '', AUDIT_TIMEZONE: '' })).toMatchObject({
      token: null,
      timeZone: AUDIT_DEFAULT_TIMEZONE,
    });
  });

  it('accepts a 32+ character token68 token', () => {
    expect(parseAuditConfig({ LEDGER_AUDIT_TOKEN: TOKEN }).token).toBe(TOKEN);
  });

  it('rejects a short token without echoing it', () => {
    const tooShort = 'tooShort123';
    expect(() => parseAuditConfig({ LEDGER_AUDIT_TOKEN: tooShort })).toThrow(/LEDGER_AUDIT_TOKEN/);
    try {
      parseAuditConfig({ LEDGER_AUDIT_TOKEN: tooShort });
    } catch (error) {
      expect(error.message).not.toContain(tooShort);
    }
  });

  it('rejects a token with characters a Bearer header cannot carry', () => {
    expect(() => parseAuditConfig({ LEDGER_AUDIT_TOKEN: `${TOKEN} space` })).toThrow(/token68/);
  });

  it('rejects an unknown time zone', () => {
    expect(() => parseAuditConfig({ AUDIT_TIMEZONE: 'Mars/Olympus' })).toThrow(/AUDIT_TIMEZONE/);
  });
});

describe('parseClientLabels', () => {
  it('maps client ids to labels, case-insensitively on the id', () => {
    const labels = parseClientLabels('0A1B2C3D4E5F6071:strike-sync, 1b2c3d4e5f607182:bank sync');
    expect([...labels]).toEqual([
      ['0a1b2c3d4e5f6071', 'strike-sync'],
      ['1b2c3d4e5f607182', 'bank sync'],
    ]);
  });

  it('names the malformed entry by position', () => {
    expect(() => parseClientLabels('0a1b2c3d4e5f6071:ok,nope')).toThrow(/entry 2/);
    expect(() => parseClientLabels('xyz:label')).toThrow(/entry 1/);
  });
});
