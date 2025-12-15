/**
 * Authorization code grant helpers.
 */

import crypto from 'crypto';
import { getDb, pruneExpiredCodes } from '../../db/authDb.js';

/**
 * Generate and store a short-lived authorization code.
 */
export const generateAuthCode = (clientId, userId, redirectUri, scope = 'api') => {
  pruneExpiredCodes();
  const code = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

  const db = getDb();
  db.prepare(`
    INSERT INTO auth_codes (code, client_id, user_id, redirect_uri, scope, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(code, clientId, userId, redirectUri, scope, expiresAt);

  return code;
};

/**
 * Validate and consume an authorization code.
 * Returns userId and scope.
 */
export const validateAuthCode = (code, clientId, redirectUri) => {
  pruneExpiredCodes();
  const db = getDb();

  const row = db.prepare(`
    SELECT user_id, scope FROM auth_codes
    WHERE code = ? AND client_id = ? AND redirect_uri = ?
  `).get(code, clientId, redirectUri);

  if (!row) throw new Error('Invalid or expired authorization code');

  // One-time use – delete
  db.prepare('DELETE FROM auth_codes WHERE code = ?').run(code);

  return { userId: row.user_id, scope: row.scope || 'api' };
};