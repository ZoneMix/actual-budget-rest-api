/**
 * Authentication database layer.
 * Handles SQLite connection,
 * schema creation, migrations, and pruning of expired data.
 */

import Database from 'better-sqlite3';
import { AUTH_DB_PATH, ACCESS_TTL_SECONDS } from '../config/index.js';

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
      is_active BOOLEAN DEFAULT TRUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

  return db;
};

/** Record a token with explicit type and expiry */
export const insertToken = (jti, tokenType, expiresAt) => {
  const db = getDb();
  db.prepare(
    'INSERT INTO tokens (jti, token_type, expires_at, revoked) VALUES (?, ?, ?, FALSE)'
  ).run(jti, tokenType, expiresAt);
};

/** Prune expired access/refresh tokens */
export const pruneExpiredTokens = () => {
  const db = getDb();
  const stmt = db.prepare(`
    DELETE FROM tokens
    WHERE expires_at IS NOT NULL
      AND datetime(expires_at) < datetime('now')
  `);
  const { changes: deletedCount } = stmt.run();
  if (deletedCount > 0) console.log(`Pruned ${deletedCount} expired tokens.`);
};

/** Prune expired authorization codes (10-minute TTL) */
export const pruneExpiredCodes = () => {
  const db = getDb();
  db.prepare(`DELETE FROM auth_codes WHERE datetime(expires_at) < datetime('now')`).run();
};

/** Close the database connection (used on shutdown) */
export const closeDb = () => {
  if (db) {
    db.close();
    db = null;
    console.log('Auth DB closed.');
  }
};