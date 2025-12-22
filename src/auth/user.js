/**
 * User management and local password authentication.
 */

import bcrypt from 'bcrypt';
import { executeQuery, getRow, pruneExpiredTokens } from '../db/authDb.js';
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
 * Sets role='admin' and scopes='api,admin' for the admin user.
 */
export const ensureAdminUserHash = async () => {
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

  // Use PostgreSQL or SQLite compatible UPSERT (both support ON CONFLICT)
  // Try to use role/scopes columns if they exist (migrations should have added them)
  // If they don't exist yet, fall back to basic query
  try {
    // Try the full query with role/scopes/updated_at
    await executeQuery(`
      INSERT INTO users (username, password_hash, role, scopes, is_active, updated_at)
      VALUES (?, ?, 'admin', 'api,admin', TRUE, CURRENT_TIMESTAMP)
      ON CONFLICT(username) DO UPDATE SET
        password_hash = excluded.password_hash,
        role = 'admin',
        scopes = 'api,admin',
        updated_at = CURRENT_TIMESTAMP
    `, [adminUsername, hash]);
    logger.info(`Admin user '${adminUsername}' hash created/updated with admin role and scopes`);
  } catch {
    // If columns don't exist, try without updated_at
    try {
      await executeQuery(`
        INSERT INTO users (username, password_hash, role, scopes, is_active)
        VALUES (?, ?, 'admin', 'api,admin', TRUE)
        ON CONFLICT(username) DO UPDATE SET
          password_hash = excluded.password_hash,
          role = 'admin',
          scopes = 'api,admin'
      `, [adminUsername, hash]);
      logger.info(`Admin user '${adminUsername}' hash created/updated with admin role and scopes`);
    } catch {
      // Fallback to basic query if role/scopes columns don't exist
      await executeQuery(`
        INSERT INTO users (username, password_hash, is_active)
        VALUES (?, ?, TRUE)
        ON CONFLICT(username) DO UPDATE SET
          password_hash = excluded.password_hash
      `, [adminUsername, hash]);
      logger.info(`Admin user '${adminUsername}' hash created/updated`);
    }
  }
};

/**
 * Authenticate a local user with username/password.
 * Returns userId, username, role, and scopes.
 */
export const authenticateUser = async (username, password) => {
  await pruneExpiredTokens();
  const user = await getRow('SELECT * FROM users WHERE username = ? AND is_active = TRUE', [username]);
  if (!user) {
    logAuthEvent('LOGIN_FAILED', null, { username, reason: 'user_not_found' }, false);
    throw new Error('User not found or inactive');
  }

  if (!(await bcrypt.compare(password, user.password_hash))) {
    logAuthEvent('LOGIN_FAILED', user.id, { username, reason: 'invalid_password' }, false);
    throw new Error('Invalid password');
  }

  // Parse scopes from comma-separated string or default to 'api'
  const scopes = user.scopes ? user.scopes.split(',').map(s => s.trim()).filter(Boolean) : ['api'];
  const role = user.role || 'user';

  logAuthEvent('LOGIN_SUCCESS', user.id, { username, role }, true);

  return { 
    userId: user.id, 
    username: user.username,
    role,
    scopes,
  };
};