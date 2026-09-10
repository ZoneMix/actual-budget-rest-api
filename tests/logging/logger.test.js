/**
 * Auth audit logging — the security log has to be readable.
 *
 * `logAuthEvent`/`logSuspiciousActivity` used to call `logger.info({...})` with
 * no message string, so Winston stringified the object into the `message`
 * position and every auth event printed as `[object Object]`. Every
 * SCOPE_WOULD_DENY / AUTH_FAILED / REVOKED_TOKEN_USE record depends on this
 * being both greppable (message) and structured (metadata), so both are
 * asserted: once against the call itself and once against what the transport
 * actually renders.
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';
import logger, { logAuthEvent, logSuspiciousActivity } from '../../src/logging/logger.js';

const MESSAGE = Symbol.for('message');

/** Capture what the console transport actually renders while `fn` runs. */
const renderedBy = (fn) => {
  const [transport] = logger.transports;
  const lines = [];
  const spy = jest.spyOn(transport, 'log').mockImplementation((info, next) => {
    lines.push(String(info[MESSAGE] ?? info.message));
    if (next) next();
  });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return lines;
};

describe('logAuthEvent', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs a message string first and keeps the metadata shape', () => {
    const spy = jest.spyOn(logger, 'info').mockImplementation(() => logger);

    logAuthEvent('SCOPE_WOULD_DENY', 42, { required: 'write', path: '/v2/accounts' }, false);

    expect(spy).toHaveBeenCalledTimes(1);
    const [message, meta] = spy.mock.calls[0];
    expect(typeof message).toBe('string');
    expect(message).toContain('SCOPE_WOULD_DENY');
    expect(meta).toMatchObject({
      type: 'AUTH_EVENT',
      event: 'SCOPE_WOULD_DENY',
      userId: 42,
      success: false,
      required: 'write',
      path: '/v2/accounts',
    });
  });

  it('renders a greppable line, not [object Object]', () => {
    const lines = renderedBy(() => logAuthEvent('AUTH_FAILED', 7, { reason: 'missing_token' }, false));

    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain('[object Object]');
    expect(lines[0]).toContain('AUTH_FAILED');
    expect(lines[0]).toContain('missing_token');
  });
});

describe('logSuspiciousActivity', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs a message string first and keeps the alert metadata', () => {
    const spy = jest.spyOn(logger, 'error').mockImplementation(() => logger);

    logSuspiciousActivity('REVOKED_TOKEN_USE', 9, { jti: 'abc', ip: '127.0.0.1' });

    expect(spy).toHaveBeenCalledTimes(1);
    const [message, meta] = spy.mock.calls[0];
    expect(typeof message).toBe('string');
    expect(message).toContain('REVOKED_TOKEN_USE');
    expect(meta).toMatchObject({
      type: 'SECURITY_ALERT',
      category: 'REVOKED_TOKEN_USE',
      userId: 9,
      jti: 'abc',
      ip: '127.0.0.1',
      alert: true,
    });
  });

  it('renders a greppable line, not [object Object]', () => {
    const lines = renderedBy(() => logSuspiciousActivity('INVALID_TOKEN', null, { ip: '10.0.0.1' }));

    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain('[object Object]');
    expect(lines[0]).toContain('INVALID_TOKEN');
  });
});
