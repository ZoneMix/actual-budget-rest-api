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

