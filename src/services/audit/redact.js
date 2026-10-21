/**
 * Keeps credentials, tokens and environment values out of audit output.
 *
 * Actual's synced tables hold no credentials today (bank-sync secrets live on
 * actual-server, not in the budget file), so this is defence in depth: any
 * value that could be one is replaced before it leaves the process.
 *   - a column or row id whose name says secret (password, token, api_key, ...);
 *     row ids matter for key/value tables such as `preferences`;
 *   - a value containing a secret-bearing env value of this process, or equal
 *     to one when the secret is too short to search for safely;
 *   - a value shaped like a JWT, a Bearer credential or a PEM private key.
 */

export const REDACTED = '[redacted]';

// Shorter env secrets are matched only as the whole value: a 4-character dev
// password would otherwise redact every note that happens to contain it.
const MIN_SUBSTRING_SECRET_LENGTH = 8;

const SENSITIVE_ENV_KEY = /(PASS(WORD)?|SECRET|TOKEN|KEY|CREDENTIALS?|_URL|SYNC_ID)$/i;
const URL_ENV_KEY = /_URL$/i;
const SENSITIVE_NAME = /(password|passwd|passphrase|secret|token|api_?key|access_?key|credential|private_?key)/i;
const SECRET_SHAPES = [
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

const decodedOrRaw = (text) => {
  try {
    return decodeURIComponent(text);
  } catch (error) {
    if (error instanceof URIError) return text;
    throw error;
  }
};

/** The password inside a connection URL, raw and decoded; none when it has none. */
const urlPasswords = (value) => {
  if (!URL.canParse(value)) return [];
  const { password } = new URL(value);
  return password ? [password, decodedOrRaw(password)] : [];
};

/** Secret-bearing values of an env map (and URL-embedded passwords), longest first. */
export const secretEnvValues = (env) => {
  const values = Object.entries(env)
    .filter(([key, value]) => SENSITIVE_ENV_KEY.test(key) && typeof value === 'string' && value !== '')
    .flatMap(([key, value]) => (URL_ENV_KEY.test(key) ? [value, ...urlPasswords(value)] : [value]));
  return [...new Set(values)].sort((a, b) => b.length - a.length);
};

/**
 * @param {string[]} secrets - exact values that must never be returned
 * @returns {(names: string[], value: unknown) => boolean} true when the value
 *   must be withheld; `names` are the column and row id it belongs to
 */
export const createRedactor = (secrets) => {
  const searchable = secrets.filter((secret) => secret.length >= MIN_SUBSTRING_SECRET_LENGTH);
  const exactOnly = new Set(secrets.filter((secret) => secret.length < MIN_SUBSTRING_SECRET_LENGTH));
  return (names, value) => {
    if (names.some((name) => SENSITIVE_NAME.test(String(name ?? '')))) return true;
    if (typeof value !== 'string') return false;
    if (exactOnly.has(value) || searchable.some((secret) => value.includes(secret))) return true;
    return SECRET_SHAPES.some((shape) => shape.test(value));
  };
};
