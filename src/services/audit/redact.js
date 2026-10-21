/**
 * Keeps credentials, tokens and environment values out of audit output.
 *
 * Actual's synced tables hold no credentials today (bank-sync secrets live on
 * actual-server, not in the budget file), so this is defence in depth: any
 * value that could be one is replaced before it leaves the process.
 *   - a column whose name says secret (password, token, api_key, ...);
 *   - a value containing any secret-bearing env value of this process;
 *   - a value shaped like a JWT, a Bearer credential or a PEM private key.
 */

export const REDACTED = '[redacted]';

// Env values shorter than this are not matched: a 4-character dev password
// would otherwise redact every note that happens to contain the word.
const MIN_SECRET_LENGTH = 8;

const SENSITIVE_ENV_KEY = /(PASS(WORD)?|SECRET|TOKEN|KEY|CREDENTIALS?|_URL|SYNC_ID)$/i;
const SENSITIVE_COLUMN = /(password|passwd|passphrase|secret|token|api_?key|access_?key|credential|private_?key)/i;
const SECRET_SHAPES = [
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

/** Secret-bearing values of an env map, longest first. */
export const secretEnvValues = (env) =>
  Object.entries(env)
    .filter(([key, value]) => SENSITIVE_ENV_KEY.test(key) && typeof value === 'string' && value.length >= MIN_SECRET_LENGTH)
    .map(([, value]) => value)
    .sort((a, b) => b.length - a.length);

/**
 * @param {string[]} secrets - exact values that must never be returned
 * @returns {(column: string, value: unknown) => boolean} true when the value must be withheld
 */
export const createRedactor = (secrets) => {
  const known = [...secrets];
  return (column, value) => {
    if (SENSITIVE_COLUMN.test(column)) return true;
    if (typeof value !== 'string') return false;
    if (known.some((secret) => value.includes(secret))) return true;
    return SECRET_SHAPES.some((shape) => shape.test(value));
  };
};
