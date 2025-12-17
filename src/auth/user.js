/**
 * User management and local password authentication.
 */

import bcrypt from 'bcrypt';
import { getDb } from '../db/authDb.js';
import { pruneExpiredTokens } from '../db/authDb.js';
import logger, { logAuthEvent } from '../logging/logger.js';

/**
 * Validate password complexity.
 * Requirements:
 * - At least 12 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
export const validatePasswordComplexity = (password) => {
  if (password.length < 12) {
    return { valid: false, message: 'Password must be at least 12 characters long' };
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }

  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }

  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }

  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one special character (!@#$%^&*(),.?":{}|<>)' };
  }

  return { valid: true };
};

/**
 * Ensures the admin user exists and its password hash is up-to-date.
 * Called on server startup.
 */
export const ensureAdminUserHash = async () => {
  const db = getDb();
  const adminUsername = process.env.ADMIN_USER || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    logger.error('ADMIN_PASSWORD missing – cannot create admin user. Exiting.');
    process.exit(1);
  }

  // Validate password complexity for new passwords
  const passwordValidation = validatePasswordComplexity(adminPassword);
  if (!passwordValidation.valid) {
    logger.warn(`Admin password does not meet complexity requirements: ${passwordValidation.message}`);
    logger.warn('Consider updating ADMIN_PASSWORD to meet security standards');
  }

  const hash = await bcrypt.hash(adminPassword, 12);

  const upsert = db.prepare(`
    INSERT INTO users (username, password_hash, is_active)
    VALUES (?, ?, TRUE)
    ON CONFLICT(username) DO UPDATE SET
      password_hash = excluded.password_hash
  `);

  upsert.run(adminUsername, hash);
  logger.info(`Admin user '${adminUsername}' hash created/updated`);
};

/**
 * Authenticate a local user with username/password.
 * Returns userId and username.
 */
export const authenticateUser = async (username, password) => {
  pruneExpiredTokens();
  const db = getDb();

  const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = TRUE').get(username);
  if (!user) {
    logAuthEvent('LOGIN_FAILED', null, { username, reason: 'user_not_found' }, false);
    throw new Error('User not found or inactive');
  }

  if (!(await bcrypt.compare(password, user.password_hash))) {
    logAuthEvent('LOGIN_FAILED', user.id, { username, reason: 'invalid_password' }, false);
    throw new Error('Invalid password');
  }

  logAuthEvent('LOGIN_SUCCESS', user.id, { username }, true);

  return { userId: user.id, username: user.username };
};