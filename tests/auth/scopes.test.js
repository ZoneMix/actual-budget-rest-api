/**
 * The scope model: names, implication closure, and the two predicates the
 * middleware and the admin API are built on.
 *
 * `expandScopes` is the whole security argument in one function — if `write`
 * stops implying `read`, or legacy `api` starts implying `admin`, every
 * `requireScope*` decision downstream is wrong. So the closure is pinned
 * exhaustively, in every accepted input shape.
 */

import { describe, it, expect } from '@jest/globals';
import { SCOPES, expandScopes, hasScope, isAdmin, parseScopeList } from '../../src/auth/scopes.js';
import { SCOPES as VALIDATION_SCOPE_NAMES } from '../../src/validation/constants.js';

const sorted = (set) => [...set].sort();

describe('SCOPES', () => {
  it('names the four scopes and is frozen', () => {
    expect(SCOPES).toEqual({ READ: 'read', WRITE: 'write', ADMIN: 'admin', LEGACY_API: 'api' });
    expect(Object.isFrozen(SCOPES)).toBe(true);
  });

  it('stays in sync with the admin-schema scope enum', () => {
    expect(Object.values(SCOPES).sort()).toEqual([...VALIDATION_SCOPE_NAMES].sort());
  });
});

describe('parseScopeList', () => {
  it('splits on commas and whitespace without expanding or filtering', () => {
    // The OAuth2 layer needs what was *requested*, unknown names included, so
    // it can answer invalid_scope instead of silently dropping them.
    expect(parseScopeList('read, write  admin')).toEqual(['read', 'write', 'admin']);
    expect(parseScopeList(['read', ' write '])).toEqual(['read', 'write']);
    expect(parseScopeList('superuser')).toEqual(['superuser']);
    expect(parseScopeList(undefined)).toEqual([]);
  });
});

describe('expandScopes — implication closure', () => {
  it('read implies only read', () => {
    expect(sorted(expandScopes('read'))).toEqual(['read']);
  });

  it('write implies read', () => {
    expect(sorted(expandScopes('write'))).toEqual(['read', 'write']);
  });

  it('admin implies write and read', () => {
    expect(sorted(expandScopes('admin'))).toEqual(['admin', 'read', 'write']);
  });

  it('legacy api implies read and write but never admin', () => {
    const granted = expandScopes('api');

    expect(sorted(granted)).toEqual(['api', 'read', 'write']);
    expect(granted.has(SCOPES.ADMIN)).toBe(false);
  });

  it('closes over every scope in a multi-scope grant', () => {
    expect(sorted(expandScopes('api,admin'))).toEqual(['admin', 'api', 'read', 'write']);
  });
});

describe('expandScopes — input shapes', () => {
  it('accepts an array, a comma string and a space string identically', () => {
    const fromArray = sorted(expandScopes(['read', 'write']));

    expect(sorted(expandScopes('read,write'))).toEqual(fromArray);
    expect(sorted(expandScopes('read write'))).toEqual(fromArray);
    expect(sorted(expandScopes(' read ,  write '))).toEqual(fromArray);
  });

  it('drops unknown scopes instead of granting them', () => {
    expect(sorted(expandScopes('read,superuser'))).toEqual(['read']);
    expect(sorted(expandScopes('nonsense'))).toEqual([]);
  });

  it('falls back to the legacy api expansion when empty or undefined', () => {
    const legacy = sorted(expandScopes('api'));

    expect(sorted(expandScopes(''))).toEqual(legacy);
    expect(sorted(expandScopes(undefined))).toEqual(legacy);
    expect(sorted(expandScopes(null))).toEqual(legacy);
    expect(sorted(expandScopes([]))).toEqual(legacy);
  });

  it('ignores non-string, non-array input', () => {
    expect(sorted(expandScopes(42))).toEqual(sorted(expandScopes('api')));
  });
});

describe('expandScopes — immutability', () => {
  it('returns a frozen set that cannot be widened by a caller', () => {
    const granted = expandScopes('read');

    expect(Object.isFrozen(granted)).toBe(true);
    expect(() => granted.add(SCOPES.ADMIN)).toThrow(TypeError);
    expect(() => granted.delete(SCOPES.READ)).toThrow(TypeError);
    expect(() => granted.clear()).toThrow(TypeError);
    expect(sorted(granted)).toEqual(['read']);
  });
});

describe('hasScope', () => {
  it('reads the scopes array first', () => {
    const user = { scopes: ['write'], scope: 'admin' };

    expect(hasScope(user, SCOPES.READ)).toBe(true);
    expect(hasScope(user, SCOPES.ADMIN)).toBe(false);
  });

  it('falls back to the scope string', () => {
    expect(hasScope({ scope: 'admin' }, SCOPES.WRITE)).toBe(true);
  });

  it('requires every scope when given an array', () => {
    expect(hasScope({ scopes: ['write'] }, [SCOPES.READ, SCOPES.WRITE])).toBe(true);
    expect(hasScope({ scopes: ['read'] }, [SCOPES.READ, SCOPES.WRITE])).toBe(false);
  });

  it('is true for an empty requirement and false without a user', () => {
    expect(hasScope({ scopes: ['read'] }, [])).toBe(true);
    expect(hasScope(null, SCOPES.READ)).toBe(false);
    expect(hasScope(undefined, [])).toBe(false);
  });

  it('grants a legacy api token read and write, never admin', () => {
    const legacy = { scope: 'api', scopes: ['api'] };

    expect(hasScope(legacy, SCOPES.READ)).toBe(true);
    expect(hasScope(legacy, SCOPES.WRITE)).toBe(true);
    expect(hasScope(legacy, SCOPES.ADMIN)).toBe(false);
  });
});

describe('isAdmin', () => {
  it('is true for the admin scope', () => {
    expect(isAdmin({ role: 'user', scopes: ['admin'] })).toBe(true);
    expect(isAdmin({ role: 'user', scope: 'api,admin' })).toBe(true);
  });

  it('is true for an admin-role user whose grant carries the admin scope', () => {
    expect(isAdmin({ role: 'admin', scopes: ['api', 'admin'] })).toBe(true);
  });

  // The role claim alone is NOT sufficient. An admin user can deliberately
  // issue a narrow token — through an `api`-only OAuth client, say — and that
  // token must not reach an admin-gated route just because the person behind
  // it happens to be an admin. The grant is what is being checked, not who.
  it('is false for an admin-role user holding a deliberately narrow token', () => {
    expect(isAdmin({ role: 'admin', scopes: ['read'] })).toBe(false);
    expect(isAdmin({ role: 'admin', scope: 'api' })).toBe(false);
  });

  it('is false for a legacy api token and for no user', () => {
    expect(isAdmin({ role: 'user', scope: 'api' })).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });
});
