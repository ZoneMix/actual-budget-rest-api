/**
 * OAuth2 scope negotiation — pure.
 *
 * Two lists meet at every grant: what the request asked for, and what the
 * client row (`clients.allowed_scopes`, a comma string) is registered to hand
 * out. The client's list is expanded through the scope model first, so a client
 * allowed `api` may also grant `read` or `write` — but never `admin`, which
 * `api` deliberately does not imply.
 *
 * Anything the expanded set does not contain — including a scope name that
 * simply does not exist — is refused as `invalid_scope` (RFC 6749 §4.1.2.1).
 */

import { expandScopes, parseScopeList, SCOPES } from '../scopes.js';

/** What a request with no `scope` parameter means: today's default. */
export const DEFAULT_REQUESTED_SCOPES = Object.freeze([SCOPES.LEGACY_API]);

/**
 * Scopes a request asked for, in the order given.
 *
 * @param {string|string[]|undefined} raw - Space- or comma-separated request
 * @returns {string[]} Requested scope names (never empty)
 */
export const parseRequestedScopes = (raw) => {
  const requested = parseScopeList(raw);
  return requested.length > 0 ? requested : [...DEFAULT_REQUESTED_SCOPES];
};

/**
 * Everything a client may grant, closed under implication.
 *
 * @param {object} client - Client row (`allowed_scopes` comma string)
 * @returns {ReadonlySet<string>} Frozen set of grantable scopes
 */
export const clientAllowedScopes = (client) => expandScopes(client?.allowed_scopes);

/**
 * Requested scopes this client may not grant.
 *
 * @param {string[]} requested - Requested scope names
 * @param {ReadonlySet<string>} allowed - Result of clientAllowedScopes()
 * @returns {string[]} The offending scope names (empty when all are allowed)
 */
export const disallowedScopes = (requested, allowed) => requested.filter((scope) => !allowed.has(scope));

/**
 * Narrow an already-granted list to what the client still allows. Used on
 * refresh: a scope the client lost since the grant is dropped, not an error.
 *
 * @param {string[]} granted - Previously granted scope names
 * @param {ReadonlySet<string>} allowed - Result of clientAllowedScopes()
 * @returns {string[]} The surviving scope names
 */
export const intersectScopes = (granted, allowed) => granted.filter((scope) => allowed.has(scope));

/**
 * Canonical storage/transport form: unique, sorted, comma-joined.
 *
 * @param {string[]} scopes - Scope names
 * @returns {string} e.g. "read,write"
 */
export const formatScopes = (scopes) => [...new Set(scopes)].sort().join(',');
