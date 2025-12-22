/**
 * Authentication database layer.
 * Handles SQLite or PostgreSQL connection,
 * schema creation, migrations, and pruning of expired data.
 */

import Database from 'better-sqlite3';
import pg from 'pg';
import {
  AUTH_DB_PATH,
  POSTGRES_URL,
  POSTGRES_HOST,
  POSTGRES_PORT,
  POSTGRES_DB,
  POSTGRES_USER,
  POSTGRES_PASSWORD,
  isPostgresConfigured,
} from '../config/index.js';
import logger from '../logging/logger.js';

const { Pool } = pg;

let db = null;
let pgPool = null;
let schemaInitialized = false;
let schemaInitPromise = null;

/**
 * Returns a PostgreSQL connection pool.
 */
const getPostgresPool = () => {
  if (pgPool) return pgPool;

  let connectionConfig;
  
  if (POSTGRES_URL) {
    connectionConfig = POSTGRES_URL;
  } else {
    connectionConfig = {
      host: POSTGRES_HOST,
      port: POSTGRES_PORT || 5432,
      database: POSTGRES_DB,
      user: POSTGRES_USER,
      password: POSTGRES_PASSWORD,
    };
  }

  pgPool = new Pool(
    typeof connectionConfig === 'string'
      ? { connectionString: connectionConfig }
      : connectionConfig
  );

  // Handle pool errors
  pgPool.on('error', (err) => {
    logger.error('Unexpected PostgreSQL pool error', { error: err.message });
  });

  return pgPool;
};

/**
 * Initialize SQLite schema.
 */
const initializeSqliteSchema = (database) => {
  database.exec(`
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

  // SQLite migrations
  try {
    const usersTableInfo = database.prepare("PRAGMA table_info(users)").all();
    const clientsTableInfo = database.prepare("PRAGMA table_info(clients)").all();
    
    // Migration 1: Add role, scopes, and updated_at to users table
    const hasRoleColumn = usersTableInfo.some(col => col.name === 'role');
    const hasScopesColumn = usersTableInfo.some(col => col.name === 'scopes');
    const hasUpdatedAtColumn = usersTableInfo.some(col => col.name === 'updated_at');
    
    if (!hasRoleColumn) {
      logger.info('Migrating users table: adding role column');
      database.exec(`
        ALTER TABLE users 
        ADD COLUMN role TEXT DEFAULT 'user';
      `);
      logger.info('Migration complete: role column added to users table');
    }
    
    if (!hasScopesColumn) {
      logger.info('Migrating users table: adding scopes column');
      database.exec(`
        ALTER TABLE users 
        ADD COLUMN scopes TEXT DEFAULT 'api';
      `);
      logger.info('Migration complete: scopes column added to users table');
    }
    
    if (!hasUpdatedAtColumn) {
      logger.info('Migrating users table: adding updated_at column');
      database.exec(`
        ALTER TABLE users 
        ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;
      `);
      logger.info('Migration complete: updated_at column added to users table');
    }
    
    // Set admin user's role and scopes if they were just added
    if (!hasRoleColumn || !hasScopesColumn) {
      const adminUsername = process.env.ADMIN_USER || 'admin';
      const adminUser = database.prepare('SELECT id FROM users WHERE username = ?').get(adminUsername);
      if (adminUser) {
        const updateFields = [];
        if (!hasRoleColumn) updateFields.push("role = 'admin'");
        if (!hasScopesColumn) updateFields.push("scopes = 'api,admin'");
        if (updateFields.length > 0) {
          database.prepare(`
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
      database.exec(`
        ALTER TABLE clients 
        ADD COLUMN client_secret_hashed BOOLEAN DEFAULT FALSE;
      `);
      logger.info('Migration complete: client_secret_hashed column added');
    }
  } catch (migrationError) {
    logger.warn('Migration check failed (this is usually safe to ignore):', {
      error: migrationError.message,
    });
  }
};

/**
 * Initialize PostgreSQL schema.
 */
const initializePostgresSchema = async (pool) => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tokens (
        jti VARCHAR(255) PRIMARY KEY,
        token_type VARCHAR(50) NOT NULL DEFAULT 'access',
        revoked BOOLEAN DEFAULT FALSE,
        issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS clients (
        client_id VARCHAR(255) PRIMARY KEY,
        client_secret TEXT NOT NULL,
        client_secret_hashed BOOLEAN DEFAULT FALSE,
        allowed_scopes TEXT DEFAULT 'api',
        redirect_uris TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS auth_codes (
        code VARCHAR(255) PRIMARY KEY,
        client_id VARCHAR(255) NOT NULL,
        user_id INTEGER NOT NULL,
        redirect_uri TEXT NOT NULL,
        scope TEXT,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // PostgreSQL migrations: Add missing columns
    try {
      // Migration 1: Add role, scopes, and updated_at to users table
      const usersColumnCheck = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name IN ('role', 'scopes', 'updated_at')
      `);
      
      const hasRole = usersColumnCheck.rows.some(col => col.column_name === 'role');
      const hasScopes = usersColumnCheck.rows.some(col => col.column_name === 'scopes');
      const hasUpdatedAt = usersColumnCheck.rows.some(col => col.column_name === 'updated_at');
      
      if (!hasRole) {
        logger.info('Migrating users table: adding role column');
        await client.query(`
          ALTER TABLE users 
          ADD COLUMN role VARCHAR(50) DEFAULT 'user';
        `);
        logger.info('Migration complete: role column added to users table');
      }
      
      if (!hasScopes) {
        logger.info('Migrating users table: adding scopes column');
        await client.query(`
          ALTER TABLE users 
          ADD COLUMN scopes TEXT DEFAULT 'api';
        `);
        logger.info('Migration complete: scopes column added to users table');
      }
      
      if (!hasUpdatedAt) {
        logger.info('Migrating users table: adding updated_at column');
        await client.query(`
          ALTER TABLE users 
          ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        `);
        logger.info('Migration complete: updated_at column added to users table');
      }
      
      // Set admin user's role and scopes if they were just added
      if (!hasRole || !hasScopes) {
        const adminUsername = process.env.ADMIN_USER || 'admin';
        const adminUserResult = await client.query('SELECT id FROM users WHERE username = $1', [adminUsername]);
        if (adminUserResult.rows.length > 0) {
          const updateFields = [];
          if (!hasRole) updateFields.push("role = 'admin'");
          if (!hasScopes) updateFields.push("scopes = 'api,admin'");
          if (updateFields.length > 0) {
            await client.query(`
              UPDATE users 
              SET ${updateFields.join(', ')}
              WHERE username = $1
            `, [adminUsername]);
            logger.info(`Updated existing admin user '${adminUsername}' with admin role and scopes`);
          }
        }
      }
      
      // Migration 2: Add client_secret_hashed to clients table
      const clientsColumnCheck = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'clients' AND column_name = 'client_secret_hashed'
      `);
      
      if (clientsColumnCheck.rows.length === 0) {
        logger.info('Migrating clients table: adding client_secret_hashed column');
        await client.query(`
          ALTER TABLE clients 
          ADD COLUMN client_secret_hashed BOOLEAN DEFAULT FALSE;
        `);
        logger.info('Migration complete: client_secret_hashed column added');
      }
    } catch (migrationError) {
      logger.warn('Migration check failed (this is usually safe to ignore):', {
        error: migrationError.message,
      });
    }
  } finally {
    client.release();
  }
};

/**
 * Returns the database instance (SQLite or PostgreSQL pool).
 * Initializes schema on first call.
 */
export const getDb = () => {
  if (db) return db;

  if (isPostgresConfigured()) {
    // PostgreSQL mode
    db = getPostgresPool();
    // Initialize schema and wait for it to complete
    if (!schemaInitPromise) {
      schemaInitPromise = initializePostgresSchema(db)
        .then(() => {
          schemaInitialized = true;
          logger.info('PostgreSQL schema initialized successfully');
        })
        .catch(err => {
          logger.error('Failed to initialize PostgreSQL schema', { error: err.message });
          throw err;
        });
    }
  } else {
    // SQLite mode (default)
    db = new Database(AUTH_DB_PATH);
    initializeSqliteSchema(db);
    schemaInitialized = true;
  }

  return db;
};

/**
 * Ensure the database schema is initialized before executing queries.
 * This is important for PostgreSQL where initialization is async.
 */
export const ensureSchemaInitialized = async () => {
  if (schemaInitialized) return;
  
  if (isPostgresConfigured()) {
    // Make sure getDb() has been called to start initialization
    getDb();
    // Wait for initialization to complete
    if (schemaInitPromise) {
      await schemaInitPromise;
    }
  }
};

/**
 * Convert SQLite ? placeholders to PostgreSQL $1, $2, etc.
 */
const convertPlaceholders = (sql) => {
  let paramIndex = 1;
  return sql.replace(/\?/g, () => `$${paramIndex++}`);
};

/**
 * Helper to execute a query (works with both SQLite and PostgreSQL).
 * For SQLite: synchronous execution with ? placeholders
 * For PostgreSQL: async execution with $1, $2, etc. placeholders
 */
export const executeQuery = async (sql, params = []) => {
  // Ensure schema is initialized before executing queries
  await ensureSchemaInitialized();
  
  if (isPostgresConfigured()) {
    // Convert SQLite ? placeholders to PostgreSQL $1, $2, etc.
    const pgSql = convertPlaceholders(sql);
    const pool = getDb();
    const result = await pool.query(pgSql, params);
    return {
      rows: result.rows,
      changes: result.rowCount || 0,
      lastInsertRowid: result.rows[0]?.id || null,
    };
  }
  // SQLite path
  const database = getDb();
  const stmt = database.prepare(sql);
  const result = stmt.run(...params);
  const rows = sql.trim().toUpperCase().startsWith('SELECT') 
    ? stmt.all(...params) 
    : [];
  return {
    rows,
    changes: result.changes || 0,
    lastInsertRowid: result.lastInsertRowid || null,
  };
};

/**
 * Helper to get a single row (works with both SQLite and PostgreSQL).
 */
export const getRow = async (sql, params = []) => {
  if (isPostgresConfigured()) {
    const pgSql = convertPlaceholders(sql);
    const pool = getDb();
    const result = await pool.query(pgSql, params);
    return result.rows[0] || null;
  }
  const database = getDb();
  const stmt = database.prepare(sql);
  return stmt.get(...params) || null;
};

/**
 * Helper to get all rows (works with both SQLite and PostgreSQL).
 */
export const getAllRows = async (sql, params = []) => {
  if (isPostgresConfigured()) {
    const pgSql = convertPlaceholders(sql);
    const pool = getDb();
    const result = await pool.query(pgSql, params);
    return result.rows;
  }
  const database = getDb();
  const stmt = database.prepare(sql);
  return stmt.all(...params);
};

/**
 * Record a token with explicit type and expiry.
 */
export const insertToken = async (jti, tokenType, expiresAt) => {
  await executeQuery(
    'INSERT INTO tokens (jti, token_type, expires_at, revoked) VALUES (?, ?, ?, FALSE)',
    [jti, tokenType, expiresAt]
  );
};

/**
 * Prune expired access/refresh tokens.
 */
export const pruneExpiredTokens = async () => {
  const now = new Date().toISOString();
  
  // Use database-specific date comparison
  let sql;
  if (isPostgresConfigured()) {
    sql = 'DELETE FROM tokens WHERE expires_at IS NOT NULL AND expires_at < $1';
    const result = await executeQuery(sql, [now]);
    if (result.changes > 0) {
      logger.info(`Pruned ${result.changes} expired tokens`);
    }
  } else {
    sql = 'DELETE FROM tokens WHERE expires_at IS NOT NULL AND datetime(expires_at) < datetime(?)';
    const result = await executeQuery(sql, [now]);
    if (result.changes > 0) {
      logger.info(`Pruned ${result.changes} expired tokens`);
    }
  }
};

/**
 * Prune expired authorization codes (10-minute TTL).
 */
export const pruneExpiredCodes = async () => {
  const now = new Date().toISOString();
  
  let sql;
  if (isPostgresConfigured()) {
    sql = 'DELETE FROM auth_codes WHERE expires_at < $1';
  } else {
    sql = 'DELETE FROM auth_codes WHERE datetime(expires_at) < datetime(?)';
  }
  
  const result = await executeQuery(sql, [now]);
  if (result.changes > 0) {
    logger.info(`Pruned ${result.changes} expired auth codes`);
  }
};

/**
 * Close the database connection (used on shutdown).
 */
export const closeDb = async () => {
  if (isPostgresConfigured()) {
    if (pgPool) {
      await pgPool.end();
      pgPool = null;
      db = null;
      logger.info('PostgreSQL pool closed');
    }
  } else {
    if (db) {
      db.close();
      db = null;
      logger.info('SQLite DB closed');
    }
  }
};
