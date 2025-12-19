/**
 * Central configuration and constants.
 * All environment-dependent values and shared helpers are defined here.
 */

import logger from '../logging/logger.js';

export const DATA_DIR = process.env.DATA_DIR || '/app/.actual-cache';
export const AUTH_DB_PATH = `${DATA_DIR}/auth.db`;
export const PORT = process.env.PORT || 3000;

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
      return value * multipliers[unit];
    }
  }

  const num = parseInt(expiresInStr, 10);
  if (!isNaN(num)) return num;

  throw new Error(`Invalid JWT_ACCESS_TTL: "${expiresInStr}". Use e.g., '1h', '3600', or '30m'.`);
};

export const ACCESS_TTL_SECONDS = parseExpiresInToSeconds(process.env.JWT_ACCESS_TTL || '1h');
export const REFRESH_TTL_SECONDS = parseExpiresInToSeconds(process.env.JWT_REFRESH_TTL || '24h');

logger.info('JWT TTL configuration', {
  accessTTL: `${ACCESS_TTL_SECONDS}s`,
  accessTTLSource: process.env.JWT_ACCESS_TTL || 'default',
  refreshTTL: `${REFRESH_TTL_SECONDS}s`,
  refreshTTLSource: process.env.JWT_REFRESH_TTL || 'default',
});