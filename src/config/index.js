/**
 * Central configuration and constants.
 * All environment-dependent values and shared helpers are defined here.
 */

import crypto from 'crypto';

/** Persistent data directory (shared with Actual API via Docker volume) */
export const DATA_DIR = '/app/.actual-cache';

/** Path to the SQLite authentication database */
export const AUTH_DB_PATH = `${DATA_DIR}/auth.db`;

/** Server port */
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
    if (multipliers[unit]) return value * multipliers[unit];
  }

  const num = parseInt(expiresInStr, 10);
  if (!isNaN(num)) return num;

  throw new Error(`Invalid JWT_ACCESS_TTL: "${expiresInStr}". Use e.g., '1h', '3600', or '30m'.`);
};

/** Parsed access token TTL in seconds */
export const ACCESS_TTL_SECONDS = parseExpiresInToSeconds(process.env.JWT_ACCESS_TTL || '1h');

console.log(`Parsed JWT access TTL: ${ACCESS_TTL_SECONDS}s from "${process.env.JWT_ACCESS_TTL || 'default'}"`);