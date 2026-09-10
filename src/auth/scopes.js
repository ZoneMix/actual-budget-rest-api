/**
 * The scope model — pure, dependency-free, and the single source of truth for
 * what a token is allowed to do.
 *
 * Four scopes exist (the same four `src/validation/constants.js` lets an admin
 * put on an OAuth client): `read`, `write`, `admin`, and the legacy `api` scope
 * every token issued before scope enforcement carries.
 *
 * Grants are closed under implication, so a caller only ever asks for the
 * *narrowest* scope an operation needs:
 *
 *   admin ⊃ write ⊃ read          api ⊃ write ⊃ read   (never admin)
 *
 * Legacy `api` deliberately stops short of `admin`: existing integrations keep
 * full data access, but nothing that was issued before this module existed can
 * reach an admin-gated route.
 *
 * Unknown scope names are dropped rather than trusted, and an empty grant falls
 * back to the legacy `api` expansion — that is what `authenticateJWT` assumed
 * for a token with no `scope` claim before enforcement landed.
 */

export const SCOPES = Object.freeze({
  READ: 'read',
  WRITE: 'write',
  ADMIN: 'admin',
  LEGACY_API: 'api',
});

/**
 * Scope → everything holding it implies. A Map (not a plain object) so lookups
 * of attacker-controlled scope names can never touch Object.prototype.
 */
const IMPLICATIONS = new Map([
  [SCOPES.READ, [SCOPES.READ]],
  [SCOPES.WRITE, [SCOPES.WRITE, SCOPES.READ]],
  [SCOPES.ADMIN, [SCOPES.ADMIN, SCOPES.WRITE, SCOPES.READ]],
  [SCOPES.LEGACY_API, [SCOPES.LEGACY_API, SCOPES.WRITE, SCOPES.READ]],
]);

/** Scope lists arrive comma-separated (JWT/DB) or space-separated (OAuth2). */
const SCOPE_SEPARATORS = /[\s,]+/;

const refuseMutation = () => {
  throw new TypeError('Scope sets are immutable');
};

/**
 * Freeze a scope set for real: `Object.freeze` alone still leaves `add`,
 * `delete` and `clear` working, and a widened grant is a privilege escalation.
 */
const freezeScopeSet = (set) => {
  set.add = refuseMutation;
  set.delete = refuseMutation;
  set.clear = refuseMutation;
  return Object.freeze(set);
};

/**
 * Normalise any accepted input shape into a list of trimmed scope names.
 * Exported for the OAuth2 layer, which has to know what was *requested*
 * before deciding whether the client may grant it.
 */
export const parseScopeList = (raw) => {
  const parts = Array.isArray(raw)
    ? raw
    : (typeof raw === 'string' ? raw.split(SCOPE_SEPARATORS) : []);
  return parts
    .filter((part) => typeof part === 'string')
    .map((part) => part.trim())
    .filter(Boolean);
};

/**
 * Expand a raw grant into the frozen set of scopes it actually confers.
 *
 * @param {string|string[]|undefined} raw - Comma/space separated string or array
 * @returns {ReadonlySet<string>} Frozen set closed under implication
 */
export const expandScopes = (raw) => {
  const requested = parseScopeList(raw);
  const source = requested.length > 0 ? requested : [SCOPES.LEGACY_API];
  const granted = new Set();
  source.forEach((scope) => {
    (IMPLICATIONS.get(scope) || []).forEach((implied) => granted.add(implied));
  });
  return freezeScopeSet(granted);
};

/** The raw grant carried by a JWT payload or a session-derived user object. */
const grantOf = (user) => (Array.isArray(user.scopes) ? user.scopes : user.scope);

/**
 * Check whether a user holds every required scope (implication included).
 *
 * @param {object} user - User object from a JWT (req.user)
 * @param {string|string[]} requiredScopes - Required scope(s)
 * @returns {boolean} True when the user holds all of them
 */
export const hasScope = (user, requiredScopes) => {
  if (!user) return false;
  const required = Array.isArray(requiredScopes) ? requiredScopes : [requiredScopes];
  if (required.length === 0) return true;
  const granted = expandScopes(grantOf(user));
  return required.every((scope) => granted.has(scope));
};

/**
 * Admin means the `admin` role or the `admin` scope — never legacy `api`.
 *
 * @param {object} user - User object from a JWT (req.user)
 * @returns {boolean} True when the user is an admin
 */
export const isAdmin = (user) => {
  if (!user) return false;
  if (user.role === SCOPES.ADMIN) return true;
  return hasScope(user, SCOPES.ADMIN);
};
