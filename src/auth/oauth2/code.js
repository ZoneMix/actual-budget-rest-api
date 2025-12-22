/**
 * Authorization code grant helpers.
 */

import crypto from 'crypto';
import { executeQuery, getRow, pruneExpiredCodes } from '../../db/authDb.js';

/**
 * Generate and store a short-lived authorization code.
 */
export const generateAuthCode = async (clientId, userId, redirectUri, scope = 'api') => {
  await pruneExpiredCodes();
  const code = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

  await executeQuery(`
    INSERT INTO auth_codes (code, client_id, user_id, redirect_uri, scope, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [code, clientId, userId, redirectUri, scope, expiresAt]);

  return code;
};

/**
 * Validate authorization code format (64 hex characters).
 */
const validateAuthCodeFormat = (code) => {
  const AUTH_CODE_PATTERN = /^[a-f0-9]{64}$/i;
  return AUTH_CODE_PATTERN.test(code);
};

/**
 * Validate and consume an authorization code.
 * Returns userId and scope.
 */
export const validateAuthCode = async (code, clientId, redirectUri) => {
  if (!validateAuthCodeFormat(code)) {
    throw new Error('Invalid authorization code format');
  }
  await pruneExpiredCodes();
  const row = await getRow(`
    SELECT user_id, scope FROM auth_codes
    WHERE code = ? AND client_id = ? AND redirect_uri = ?
  `, [code, clientId, redirectUri]);

  if (!row) throw new Error('Invalid or expired authorization code');

  // One-time use – delete
  await executeQuery('DELETE FROM auth_codes WHERE code = ?', [code]);

  return { userId: row.user_id, scope: row.scope || 'api' };
};