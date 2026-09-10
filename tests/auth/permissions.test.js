/**
 * Scope middleware: requireScopeByMethod / requireScope / requireAdminRole.
 *
 * Mode is read from `AUTH_SCOPE_ENFORCEMENT` at *request* time (config's
 * getScopeEnforcementMode()), not at import time — that is the whole reason
 * these tests can flip `process.env` between cases instead of re-importing the
 * module per mode. Every test sets the mode explicitly; `afterEach` restores
 * whatever the process started with so an unset env still exercises the
 * documented `warn` default in its own case.
 *
 * The middlewares signal denial by throwing (Express 5 forwards a synchronous
 * throw to the error handler), so denials are asserted with `toThrow` and the
 * error's `status`, exactly as errorHandler maps them.
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { requireScope, requireScopeByMethod, requireAdminRole } from '../../src/auth/permissions.js';
import { SCOPES } from '../../src/auth/scopes.js';
import logger from '../../src/logging/logger.js';

const ORIGINAL_MODE = process.env.AUTH_SCOPE_ENFORCEMENT;

const setMode = (mode) => {
  if (mode === undefined) {
    delete process.env.AUTH_SCOPE_ENFORCEMENT;
    return;
  }
  process.env.AUTH_SCOPE_ENFORCEMENT = mode;
};

const requestFor = (method, user, path = '/v2/accounts') => ({
  method,
  path,
  originalUrl: path,
  user,
});

/** Run a middleware against a fake request; returns the `next` spy. */
const run = (middleware, req) => {
  const next = jest.fn();
  middleware(req, {}, next);
  return next;
};

const readOnlyUser = { user_id: 1, scopes: ['read'], role: 'user' };
const legacyUser = { user_id: 2, scope: 'api', scopes: ['api'], role: 'user' };
const adminUser = { user_id: 3, scope: 'api,admin', scopes: ['api', 'admin'], role: 'admin' };

afterEach(() => {
  setMode(ORIGINAL_MODE);
  jest.restoreAllMocks();
});

describe('requireScopeByMethod — method to scope mapping', () => {
  it('treats GET, HEAD and OPTIONS as read', () => {
    setMode('enforce');
    const middleware = requireScopeByMethod();

    ['GET', 'HEAD', 'OPTIONS'].forEach((method) => {
      expect(run(middleware, requestFor(method, readOnlyUser))).toHaveBeenCalledWith();
    });
  });

  it('treats every other method as write', () => {
    setMode('enforce');
    const middleware = requireScopeByMethod();

    ['POST', 'PUT', 'PATCH', 'DELETE'].forEach((method) => {
      expect(() => middleware(requestFor(method, readOnlyUser), {}, jest.fn())).toThrow(/write/);
    });
  });
});

describe('requireScopeByMethod — enforcement modes', () => {
  it('off: lets a would-be denial through untouched', () => {
    setMode('off');
    const spy = jest.spyOn(logger, 'info').mockImplementation(() => logger);

    const next = run(requireScopeByMethod(), requestFor('POST', readOnlyUser));

    expect(next).toHaveBeenCalledWith();
    expect(spy).not.toHaveBeenCalled();
  });

  it('warn: logs SCOPE_WOULD_DENY with the decision and continues', () => {
    setMode('warn');
    const spy = jest.spyOn(logger, 'info').mockImplementation(() => logger);

    const next = run(requireScopeByMethod(), requestFor('POST', readOnlyUser));

    expect(next).toHaveBeenCalledWith();
    expect(spy).toHaveBeenCalledTimes(1);
    const [message, meta] = spy.mock.calls[0];
    expect(message).toContain('SCOPE_WOULD_DENY');
    expect(meta).toMatchObject({
      event: 'SCOPE_WOULD_DENY',
      userId: 1,
      success: false,
      required: 'write',
      actual: 'read',
      method: 'POST',
      path: '/v2/accounts',
    });
  });

  it('warn is the default when AUTH_SCOPE_ENFORCEMENT is unset', () => {
    setMode(undefined);
    const spy = jest.spyOn(logger, 'info').mockImplementation(() => logger);

    const next = run(requireScopeByMethod(), requestFor('POST', readOnlyUser));

    expect(next).toHaveBeenCalledWith();
    expect(spy.mock.calls[0][0]).toContain('SCOPE_WOULD_DENY');
  });

  it('enforce: throws a 403', () => {
    setMode('enforce');

    try {
      requireScopeByMethod()(requestFor('POST', readOnlyUser), {}, jest.fn());
      throw new Error('expected a 403 to be thrown');
    } catch (err) {
      expect(err.status).toBe(403);
      expect(err.message).toContain(SCOPES.WRITE);
    }
  });

  it('enforce: a legacy api token still reads and writes', () => {
    setMode('enforce');
    const middleware = requireScopeByMethod();

    expect(run(middleware, requestFor('GET', legacyUser))).toHaveBeenCalledWith();
    expect(run(middleware, requestFor('POST', legacyUser))).toHaveBeenCalledWith();
  });

  it('enforce: an admin token passes every method', () => {
    setMode('enforce');
    const middleware = requireScopeByMethod();

    expect(run(middleware, requestFor('DELETE', adminUser))).toHaveBeenCalledWith();
  });
});

describe('requireScope', () => {
  it('enforce: rejects a legacy api token asking for admin', () => {
    setMode('enforce');

    try {
      requireScope(SCOPES.ADMIN)(requestFor('POST', legacyUser), {}, jest.fn());
      throw new Error('expected a 403 to be thrown');
    } catch (err) {
      expect(err.status).toBe(403);
      expect(err.message).toContain(SCOPES.ADMIN);
    }
  });

  it('enforce: accepts an admin token', () => {
    setMode('enforce');

    expect(run(requireScope(SCOPES.ADMIN), requestFor('POST', adminUser))).toHaveBeenCalledWith();
  });

  it('warn: a non-admin is logged but continues', () => {
    setMode('warn');
    const spy = jest.spyOn(logger, 'info').mockImplementation(() => logger);

    const next = run(requireScope(SCOPES.ADMIN), requestFor('POST', legacyUser));

    expect(next).toHaveBeenCalledWith();
    expect(spy.mock.calls[0][1]).toMatchObject({ required: 'admin', actual: 'api,read,write' });
  });

  it('accepts an array of required scopes', () => {
    setMode('enforce');

    expect(
      run(requireScope([SCOPES.READ, SCOPES.WRITE]), requestFor('POST', legacyUser))
    ).toHaveBeenCalledWith();
  });
});

describe('missing authentication', () => {
  it('throws a 401 when req.user is absent, in warn and in enforce', () => {
    ['warn', 'enforce'].forEach((mode) => {
      setMode(mode);
      try {
        requireScopeByMethod()(requestFor('GET', undefined), {}, jest.fn());
        throw new Error(`expected a 401 in ${mode} mode`);
      } catch (err) {
        expect(err.status).toBe(401);
      }
    });
  });

  it('stays out of the way entirely when enforcement is off', () => {
    setMode('off');

    expect(run(requireScopeByMethod(), requestFor('POST', undefined))).toHaveBeenCalledWith();
  });
});

describe('requireAdminRole', () => {
  it('always enforces, regardless of the scope enforcement mode', () => {
    setMode('warn');

    try {
      requireAdminRole()(requestFor('GET', legacyUser), {}, jest.fn());
      throw new Error('expected a 403 to be thrown');
    } catch (err) {
      expect(err.status).toBe(403);
    }
  });

  it('accepts the admin role and rejects an anonymous request', () => {
    setMode('enforce');

    expect(run(requireAdminRole(), requestFor('GET', adminUser))).toHaveBeenCalledWith();
    try {
      requireAdminRole()(requestFor('GET', undefined), {}, jest.fn());
      throw new Error('expected a 401 to be thrown');
    } catch (err) {
      expect(err.status).toBe(401);
    }
  });
});
