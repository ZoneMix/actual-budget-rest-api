/**
 * OAuth2 scope negotiation — pure.
 *
 * Three lists meet at every grant: what the request asked for, what the client
 * row (`clients.allowed_scopes`, a comma string) is registered to hand out, and
 * what the signed-in user's own row (`users.scopes`) holds. Both grants are
 * expanded through the scope model first, so a client or user with `api` also
 * covers `read` and `write` — but never `admin`, which `api` deliberately does
 * not imply.
 *
 * A scope the *client* may not grant is refused outright as `invalid_scope`
 * (RFC 6749 §4.1.2.1) — including a scope name that simply does not exist. A
 * scope the *user* does not hold is dropped instead, which RFC 6749 §3.3
 * allows, and the issued `scope` says what survived; only an empty result is an
 * error. Without the user bound in, a client registered for `admin` would mint
 * admin tokens for users who hold no admin scope at all.
 */

import { expandScopes, formatScopes, intersectScopes, parseScopeList, SCOPES } from '../scopes.js';

export { formatScopes, intersectScopes };

/**
 * What a request with no `scope` parameter means for a client that has no
 * registration to fall back on. The legacy `api` grant, matching how every
 * scope-less token has always been read.
 */
export const DEFAULT_REQUESTED_SCOPES = Object.freeze([SCOPES.LEGACY_API]);

/**
 * What a request with no `scope` parameter means for THIS client.
 *
 * RFC 6749 §3.3 lets the server substitute "a pre-defined default value" when
 * the request omits the scope, and for a registered client that value is its
 * own `allowed_scopes`. A global constant instead meant a client registered
 * `allowed_scopes=read` was refused with invalid_scope unless it sent
 * `scope=read` on every request — for the one scope it is registered to hold.
 *
 * Registered, NOT expanded: the result becomes the request, and it is
 * intersected with the expanded allowed set anyway. Expanding here would widen
 * the `scope` a client registered `api` is issued from `api` to `api read
 * write`, which is the same string it gets today.
 *
 * @param {object} client - Client row (`allowed_scopes` comma string)
 * @returns {string[]} Default scope names for this client (never empty)
 */
export const clientDefaultScopes = (client) => {
  const registered = parseScopeList(client?.allowed_scopes);
  return registered.length > 0 ? registered : [...DEFAULT_REQUESTED_SCOPES];
};

/**
 * Scopes a request asked for, in the order given.
 *
 * @param {string|string[]|undefined} raw - Space- or comma-separated request
 * @param {string[]} [defaultScopes] - Used when the request asked for none
 * @returns {string[]} Requested scope names (never empty)
 */
export const parseRequestedScopes = (raw, defaultScopes = DEFAULT_REQUESTED_SCOPES) => {
  const requested = parseScopeList(raw);
  return requested.length > 0 ? requested : [...defaultScopes];
};

/**
 * Everything a client may grant, closed under implication.
 *
 * @param {object} client - Client row (`allowed_scopes` comma string)
 * @returns {ReadonlySet<string>} Frozen set of grantable scopes
 */
export const clientAllowedScopes = (client) => expandScopes(client?.allowed_scopes);

/**
 * Everything the signed-in user holds, closed under implication. An empty or
 * missing `users.scopes` means the legacy `api` grant, matching how every
 * scope-less token has always been read.
 *
 * @param {object} user - User row (`scopes` comma string)
 * @returns {ReadonlySet<string>} Frozen set of the user's scopes
 */
export const userHeldScopes = (user) => expandScopes(user?.scopes);

/**
 * Requested scopes this client may not grant.
 *
 * @param {string[]} requested - Requested scope names
 * @param {ReadonlySet<string>} allowed - Result of clientAllowedScopes()
 * @returns {string[]} The offending scope names (empty when all are allowed)
 */
export const disallowedScopes = (requested, allowed) => requested.filter((scope) => !allowed.has(scope));

