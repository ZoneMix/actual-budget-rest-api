/**
 * User management and local password authentication.
 */

import bcrypt from 'bcrypt';
import { getDb } from '../db/authDb.js';
import { pruneExpiredTokens } from '../db/authDb.js';

/**
 * Ensures the admin user exists and its password hash is up-to-date.
 * Called on server startup.
 */
export const ensureAdminUserHash = async () => {
  const db = getDb();
  const adminUsername = process.env.ADMIN_USER || 'admin';
  const adminPW = process.env.ADMIN_PW;

  if (!adminPW) {
    console.error('ADMIN_PW missing – cannot create admin user. Exiting.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(adminPW, 12);

  const upsert = db.prepare(`
    INSERT INTO users (username, password_hash, is_active)
    VALUES (?, ?, TRUE)
    ON CONFLICT(username) DO UPDATE SET
      password_hash = excluded.password_hash
  `);

  upsert.run(adminUsername, hash);
  console.log(`Admin user '${adminUsername}' hash created/updated.`);
};

/**
 * Authenticate a local user with username/password.
 * Returns userId and username.
 */
export const authenticateUser = async (username, password) => {
  pruneExpiredTokens();
  const db = getDb();

  const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = TRUE').get(username);
  if (!user) throw new Error('User not found or inactive');

  if (!(await bcrypt.compare(password, user.password_hash))) {
    throw new Error('Invalid password');
  }
  console.log(`User '${username}' authenticated successfully.`);

  return { userId: user.id, username: user.username };
};