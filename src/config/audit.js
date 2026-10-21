/**
 * Configuration for GET /v1/audit/changes, validated at import.
 *
 * Kept out of env.js, which is already past this repo's 200-line cap. The
 * contract is the same: an invalid value stops startup with the variable
 * named and its value never echoed.
 */

import { z } from 'zod';

export const AUDIT_TOKEN_MIN_LENGTH = 32;
export const AUDIT_DEFAULT_TIMEZONE = 'America/Chicago';
export const AUDIT_DEFAULT_LIMIT = 10000;
export const AUDIT_MAX_LIMIT = 50000;
/** Source label for changes stamped with this API's own CRDT client id. */
export const AUDIT_SELF_LABEL = 'actual-rest-api';

// token68 (RFC 7235), the character set a Bearer credential may use.
export const TOKEN68_PATTERN = /^[A-Za-z0-9._~+/=-]+$/;
const CLIENT_ID_PATTERN = /^[0-9a-f]{16}$/;
const LABEL_PATTERN = /^[A-Za-z0-9 ._-]{1,64}$/;

const isTimeZone = (timeZone) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
};

/** `KEY=` in an env file means unset, not an empty token. */
const blankToUndefined = (value) => (value === '' ? undefined : value);

/**
 * `AUDIT_CLIENT_LABELS=0a1b2c3d4e5f6071:strike-sync,1b2c3d4e5f607182:bank-sync`
 * maps CRDT client ids (the last 16 hex digits of a timestamp) to names.
 */
export const parseClientLabels = (raw) => {
  const entries = (raw ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);
  const pairs = entries.map((entry, index) => {
    const separator = entry.indexOf(':');
    const clientId = entry.slice(0, separator).trim().toLowerCase();
    const label = entry.slice(separator + 1).trim();
    if (separator < 0 || !CLIENT_ID_PATTERN.test(clientId) || !LABEL_PATTERN.test(label)) {
      throw new Error(`AUDIT_CLIENT_LABELS entry ${index + 1} must be <16 hex digits>:<label>`);
    }
    return [clientId, label];
  });
  return new Map(pairs);
};

const auditEnvSchema = z.object({
  LEDGER_AUDIT_TOKEN: z.preprocess(
    blankToUndefined,
    z.string()
      .min(AUDIT_TOKEN_MIN_LENGTH, `LEDGER_AUDIT_TOKEN must be at least ${AUDIT_TOKEN_MIN_LENGTH} characters`)
      .regex(TOKEN68_PATTERN, 'LEDGER_AUDIT_TOKEN may only use token68 characters')
      .optional()
  ),
  AUDIT_TIMEZONE: z.preprocess(
    blankToUndefined,
    z.string().refine(isTimeZone, 'AUDIT_TIMEZONE must be an IANA time zone').default(AUDIT_DEFAULT_TIMEZONE)
  ),
  AUDIT_CLIENT_LABELS: z.preprocess(blankToUndefined, z.string().optional()),
});

/**
 * Parses the audit settings out of an environment map.
 * Throws with the offending variable names; values are never included.
 */
export const parseAuditConfig = (source) => {
  const result = auditEnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid audit configuration: ${problems.join('; ')}`);
  }
  return Object.freeze({
    token: result.data.LEDGER_AUDIT_TOKEN ?? null,
    timeZone: result.data.AUDIT_TIMEZONE,
    clientLabels: parseClientLabels(result.data.AUDIT_CLIENT_LABELS),
  });
};

const auditConfig = parseAuditConfig(process.env);

export default auditConfig;
