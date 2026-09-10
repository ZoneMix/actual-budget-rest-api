/**
 * Central configuration and constants.
 * All environment-dependent values and shared helpers are defined here.
 *
 * This module now uses the validated environment configuration from env.js.
 * All environment variables are validated on startup.
 */

import logger from '../logging/logger.js';
import env, { getAllowedOrigins, getMaxRequestSize, isPostgresConfigured } from './env.js';

// Export validated environment variables
export const DATA_DIR = env.DATA_DIR;
export const AUTH_DB_PATH = `${DATA_DIR}/auth.db`;
export const PORT = env.PORT;
export const DB_TYPE = env.DB_TYPE;
export const POSTGRES_URL = env.POSTGRES_URL;
export const POSTGRES_HOST = env.POSTGRES_HOST;
export const POSTGRES_PORT = env.POSTGRES_PORT;
export const POSTGRES_DB = env.POSTGRES_DB;
export const POSTGRES_USER = env.POSTGRES_USER;
export const POSTGRES_PASSWORD = env.POSTGRES_PASSWORD;
export { isPostgresConfigured };

// Actual Budget engine connection
export const ACTUAL_SERVER_URL = env.ACTUAL_SERVER_URL;
export const ACTUAL_PASSWORD = env.ACTUAL_PASSWORD;
export const ACTUAL_SYNC_ID = env.ACTUAL_SYNC_ID;
export const ACTUAL_FILE_PASSWORD = env.ACTUAL_FILE_PASSWORD;

// Actual engine queue & sync policy tuning
export const ACTUAL_QUEUE_MAX_DEPTH = env.ACTUAL_QUEUE_MAX_DEPTH;
export const ACTUAL_OP_TIMEOUT_MS = env.ACTUAL_OP_TIMEOUT_MS;
export const ACTUAL_LOAD_TIMEOUT_MS = env.ACTUAL_LOAD_TIMEOUT_MS;
export const ACTUAL_HEALTH_TIMEOUT_MS = env.ACTUAL_HEALTH_TIMEOUT_MS;
export const ACTUAL_SYNC_MIN_INTERVAL_MS = env.ACTUAL_SYNC_MIN_INTERVAL_MS;

// ActualQL query limits (POST /v2/query)
export const ACTUAL_QUERY_MAX_RESULTS = env.ACTUAL_QUERY_MAX_RESULTS;
export const ACTUAL_QUERY_MAX_FILTER_DEPTH = env.ACTUAL_QUERY_MAX_FILTER_DEPTH;

export const NODE_ENV = env.NODE_ENV;
export const TRUST_PROXY = env.TRUST_PROXY;
export const LOG_LEVEL = env.LOG_LEVEL;
export const MAX_REQUEST_SIZE = getMaxRequestSize();
export const ALLOWED_ORIGINS = getAllowedOrigins();

/**
 * Parses JWT_ACCESS_TTL into seconds.
 * Supports formats: '1h', '30m', '3600' (seconds), etc.
 */
export const parseExpiresInToSeconds = (expiresInStr) => {
  if (!expiresInStr) return 3600; // Default 1 hour

  const unitMatch = expiresInStr.toLowerCase().match(/^(\d+)([smhd])$/);
  if (unitMatch) {
    const value = parseInt(unitMatch[1], 10);
    const unit = unitMatch[2];
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
    if (Object.prototype.hasOwnProperty.call(multipliers, unit)) {
      // Safe: unit is validated before access
      // eslint-disable-next-line security/detect-object-injection
      return value * multipliers[unit];
    }
  }

  const num = parseInt(expiresInStr, 10);
  if (!isNaN(num)) return num;

  throw new Error(`Invalid JWT_ACCESS_TTL: "${expiresInStr}". Use e.g., '1h', '3600', or '30m'.`);
};

export const ACCESS_TTL_SECONDS = parseExpiresInToSeconds(env.JWT_ACCESS_TTL);
export const REFRESH_TTL_SECONDS = parseExpiresInToSeconds(env.JWT_REFRESH_TTL);

// Export JWT secrets (auto-generated in development if not set)
export const JWT_SECRET = env.JWT_SECRET;
export const JWT_REFRESH_SECRET = env.JWT_REFRESH_SECRET;
export const SESSION_SECRET = env.SESSION_SECRET;

// JWT identity claims — pinned on both sign and verify so a token minted for
// another issuer/audience (or with another algorithm) is rejected outright.
export const JWT_ISSUER = env.JWT_ISSUER;
export const JWT_AUDIENCE = env.JWT_AUDIENCE;

/** Scope enforcement rollout modes. */
export const SCOPE_ENFORCEMENT_MODES = Object.freeze({
  OFF: 'off',
  WARN: 'warn',
  ENFORCE: 'enforce',
});

const VALID_ENFORCEMENT_MODES = new Set(Object.values(SCOPE_ENFORCEMENT_MODES));
const warnedEnforcementValues = new Set();

/**
 * Current scope enforcement mode, read at *request* time.
 *
 * env.js validates AUTH_SCOPE_ENFORCEMENT once on startup; this accessor
 * re-reads process.env on every call so the mode can be flipped in a test (or
 * by a supervisor restarting with a new value) without re-importing the
 * middleware. An unparseable runtime value is reported once and then ignored
 * in favour of the startup-validated one — never silently.
 */
export const getScopeEnforcementMode = () => {
  const runtimeValue = process.env.AUTH_SCOPE_ENFORCEMENT;
  if (!runtimeValue) return env.AUTH_SCOPE_ENFORCEMENT;
  if (VALID_ENFORCEMENT_MODES.has(runtimeValue)) return runtimeValue;

  if (!warnedEnforcementValues.has(runtimeValue)) {
    warnedEnforcementValues.add(runtimeValue);
    logger.warn('Invalid AUTH_SCOPE_ENFORCEMENT value; using the validated startup mode', {
      invalid: runtimeValue,
      using: env.AUTH_SCOPE_ENFORCEMENT,
      valid: [...VALID_ENFORCEMENT_MODES],
    });
  }
  return env.AUTH_SCOPE_ENFORCEMENT;
};

logger.info('JWT TTL configuration', {
  accessTTL: `${ACCESS_TTL_SECONDS}s`,
  accessTTLSource: env.JWT_ACCESS_TTL,
  refreshTTL: `${REFRESH_TTL_SECONDS}s`,
  refreshTTLSource: env.JWT_REFRESH_TTL,
});