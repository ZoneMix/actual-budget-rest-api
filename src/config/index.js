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

logger.info('JWT TTL configuration', {
  accessTTL: `${ACCESS_TTL_SECONDS}s`,
  accessTTLSource: env.JWT_ACCESS_TTL,
  refreshTTL: `${REFRESH_TTL_SECONDS}s`,
  refreshTTLSource: env.JWT_REFRESH_TTL,
});