/**
 * Authentication database layer.
 * Handles SQLite connection,
 * schema creation, migrations, and pruning of expired data.
 */

import Database from 'better-sqlite3';
import { AUTH_DB_PATH } from '../config/index.js';
import logger from '../logging/logger.js';

let db = null;

/**
 * Returns the singleton SQLite database instance.
 * Initializes schema and encryption on first call.
 */
export const getDb = () => {
  if (db) return db;

  db = new Database(AUTH_DB_PATH);

  // Schema creation
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      scopes TEXT DEFAULT 'api',
      is_active BOOLEAN DEFAULT TRUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tokens (
      jti TEXT PRIMARY KEY,
      token_type TEXT NOT NULL DEFAULT 'access',
      revoked BOOLEAN DEFAULT FALSE,
      issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS clients (
      client_id TEXT PRIMARY KEY,
      client_secret TEXT NOT NULL,
      client_secret_hashed BOOLEAN DEFAULT FALSE,
      allowed_scopes TEXT DEFAULT 'api',
      redirect_uris TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS auth_codes (
      code TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      redirect_uri TEXT NOT NULL,
      scope TEXT,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrations: Add missing columns to existing tables
  try {
    const usersTableInfo = db.prepare("PRAGMA table_info(users)").all();
    const clientsTableInfo = db.prepare("PRAGMA table_info(clients)").all();
    
    // Migration 1: Add role, scopes, and updated_at to users table
    const hasRoleColumn = usersTableInfo.some(col => col.name === 'role');
    const hasScopesColumn = usersTableInfo.some(col => col.name === 'scopes');
    const hasUpdatedAtColumn = usersTableInfo.some(col => col.name === 'updated_at');
    
    if (!hasRoleColumn) {
      logger.info('Migrating users table: adding role column');
      db.exec(`
        ALTER TABLE users 
        ADD COLUMN role TEXT DEFAULT 'user';
      `);
      logger.info('Migration complete: role column added to users table');
    }
    
    if (!hasScopesColumn) {
      logger.info('Migrating users table: adding scopes column');
      db.exec(`
        ALTER TABLE users 
        ADD COLUMN scopes TEXT DEFAULT 'api';
      `);
      logger.info('Migration complete: scopes column added to users table');
    }
    
    if (!hasUpdatedAtColumn) {
      logger.info('Migrating users table: adding updated_at column');
      db.exec(`
        ALTER TABLE users 
        ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;
      `);
      logger.info('Migration complete: updated_at column added to users table');
    }
    
    // Set admin user's role and scopes if they were just added
    if (!hasRoleColumn || !hasScopesColumn) {
      const adminUsername = process.env.ADMIN_USER || 'admin';
      const adminUser = db.prepare('SELECT id FROM users WHERE username = ?').get(adminUsername);
      if (adminUser) {
        const updateFields = [];
        if (!hasRoleColumn) updateFields.push("role = 'admin'");
        if (!hasScopesColumn) updateFields.push("scopes = 'api,admin'");
        if (updateFields.length > 0) {
          db.prepare(`
            UPDATE users 
            SET ${updateFields.join(', ')}
            WHERE username = ?
          `).run(adminUsername);
          logger.info(`Updated existing admin user '${adminUsername}' with admin role and scopes`);
        }
      }
    }
    
    // Migration 2: Add client_secret_hashed to clients table
    const hasHashedColumn = clientsTableInfo.some(col => col.name === 'client_secret_hashed');
    
    if (!hasHashedColumn) {
      logger.info('Migrating clients table: adding client_secret_hashed column');
      db.exec(`
        ALTER TABLE clients 
        ADD COLUMN client_secret_hashed BOOLEAN DEFAULT FALSE;
      `);
      logger.info('Migration complete: client_secret_hashed column added');
    }
  } catch (migrationError) {
    // If migration fails, log but don't crash (column might already exist)
    logger.warn('Migration check failed (this is usually safe to ignore):', {
      error: migrationError.message,
    });
  }

  return db;
};

/** Record a token with explicit type and expiry */
export const insertToken = (jti, tokenType, expiresAt) => {
  const connection = getDb();
  connection.prepare(
    'INSERT INTO tokens (jti, token_type, expires_at, revoked) VALUES (?, ?, ?, FALSE)'
  ).run(jti, tokenType, expiresAt);
};

/** Prune expired access/refresh tokens */
export const pruneExpiredTokens = () => {
  const connection = getDb();
  const now = new Date().toISOString();
  
  const stmt = connection.prepare(`
    DELETE FROM tokens
    WHERE expires_at IS NOT NULL
      AND datetime(expires_at) < datetime(?)
  `);
  
  const { changes: deletedCount } = stmt.run(now);
  if (deletedCount > 0) {
    logger.info(`Pruned ${deletedCount} expired tokens`);
  }
};

/** Prune expired authorization codes (10-minute TTL) */
export const pruneExpiredCodes = () => {
  const connection = getDb();
  const now = new Date().toISOString();
  
  const { changes: deletedCount } = connection.prepare(`
    DELETE FROM auth_codes WHERE datetime(expires_at) < datetime(?)
  `).run(now);
  
  if (deletedCount > 0) {
    logger.info(`Pruned ${deletedCount} expired auth codes`);
  }
};

/** Close the database connection (used on shutdown) */
export const closeDb = () => {
  if (db) {
    db.close();
    db = null;
    logger.info('Auth DB closed');
  }
};