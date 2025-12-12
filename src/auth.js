// Complete auth.js (Extensive comments added; migration unchanged)
import bcrypt from 'bcrypt'; // For secure password hashing
import jwt from 'jsonwebtoken'; // For JWT signing/verification
import crypto from 'crypto'; // For UUIDs and random tokens
import Database from 'better-sqlite3'; // Lightweight, synchronous SQLite wrapper

/**
 * Constants for auth system.
 * DATA_DIR: Matches server.js for shared .actual-cache volume.
 * AUTH_DB_PATH: SQLite file for users/tokens (encrypted if DB_MASTER_KEY set).
 * ACCESS_TTL: Default JWT access token lifetime (1h in ms).
 */
const DATA_DIR = '/app/.actual-cache';
const AUTH_DB_PATH = `${DATA_DIR}/auth.db`;
const ACCESS_TTL = parseInt(process.env.JWT_ACCESS_TTL) || 3600 * 1000; // 1 hour default
let authDB; // Singleton DB instance (lazy-init)

/**
 * Initialize (or reuse) the auth database.
 * Applies encryption if DB_MASTER_KEY provided (SQLCipher PRAGMA).
 * Creates tables for users (with OAuth support) and tokens (for revocation).
 * Includes one-time migration to add oauth_provider column if missing (for schema evolution).
 */
const initAuthDB = () => {
  if (authDB) return authDB; // Reuse existing connection
  authDB = new Database(AUTH_DB_PATH); // Open/create DB file
 
  // Enable encryption if master key provided (requires SQLCipher build of better-sqlite3)
  if (process.env.DB_MASTER_KEY) {
    authDB.exec(`PRAGMA key = '${process.env.DB_MASTER_KEY}'; PRAGMA cipher_memory_security = ON;`);
    console.log('Auth DB initialized with SQLCipher encryption.');
  } else {
    console.warn('Auth DB running unencrypted (set DB_MASTER_KEY for production).');
  }
  
  // Create tables if they don't exist
  authDB.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,  -- BCrypt hash or 'OAUTH' flag
      is_active BOOLEAN DEFAULT TRUE,
      oauth_provider TEXT,  -- NULL for local users; e.g., 'google' for OAuth-linked
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS tokens (
      jti TEXT PRIMARY KEY,  -- JWT ID for revocation tracking
      revoked BOOLEAN DEFAULT FALSE,
      issued_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration: Safely add oauth_provider column to existing tables (SQLite ALTER is limited)
  try {
    // Test query: If column missing, this fails with SQLITE_ERROR
    authDB.prepare('SELECT oauth_provider FROM users LIMIT 1').get();
  } catch (e) {
    if (e.code === 'SQLITE_ERROR' && e.message.includes('no such column: oauth_provider')) {
      authDB.exec('ALTER TABLE users ADD COLUMN oauth_provider TEXT');
      console.log('DB Migration: Added oauth_provider column to users table.');
    } else {
      throw e; // Re-throw non-migration errors
    }
  }

  return authDB;
};

/**
 * Prune expired tokens from the tokens table.
 * Called before auth operations to keep DB clean.
 * Uses ACCESS_TTL env for expiration calc.
 */
const pruneExpiredTokens = () => {
  const db = initAuthDB();
  const ttlSeconds = ACCESS_TTL / 1000;
  db.prepare(`
    DELETE FROM tokens
    WHERE datetime(issued_at, '+${ttlSeconds} seconds') < datetime('now')
  `).run();
  // Optional: Log prune count if needed
};

/**
 * Ensure admin user exists with hashed password from ADMIN_PW env.
 * Hashes on-the-fly and UPSERTs (updates hash for rotation).
 * Exits if no ADMIN_PW (required for bootstrap).
 * Sets oauth_provider to NULL for local admin.
 */
const ensureAdminUserHash = async () => {
  const db = initAuthDB();
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPW = process.env.ADMIN_PW;
  if (!adminPW) {
    console.error('ADMIN_PW env var missing; cannot create/update admin user. Exiting.');
    process.exit(1);
  }
  // Generate BCrypt hash (salt rounds: 12 for security vs. perf)
  const adminHash = await bcrypt.hash(adminPW, 12);
  // UPSERT: Insert or update hash; ensure not flagged as OAuth
  const upsertStmt = db.prepare(`
    INSERT INTO users (username, password_hash, is_active, oauth_provider)
    VALUES (?, ?, TRUE, NULL)
    ON CONFLICT(username) DO UPDATE SET 
      password_hash = excluded.password_hash,
      oauth_provider = NULL
  `);
  upsertStmt.run(adminUser, adminHash);
  console.log(`Admin user '${adminUser}' hash updated/created (OAuth flag cleared).`);
};

/**
 * Authenticate user and issue access/refresh JWTs.
 * Supports local (password) and OAuth users (skip hash check if password_hash='OAUTH').
 * Prunes expired tokens first; tracks new JTIs for revocation.
 * Throws on invalid creds.
 */
const authenticateUser = async (username, password) => {
  pruneExpiredTokens(); // Cleanup
  const db = initAuthDB();
  // Fetch active user
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = TRUE').get(username);
  if (!user) {
    throw new Error('User not found or inactive');
  }
  // OAuth users: No password check (pre-verified by provider); local: BCrypt compare
  if (user.password_hash === 'OAUTH') {
    if (!password) { // Dummy check; in practice, called post-OAuth
      throw new Error('Invalid credentials for OAuth user');
    }
  } else if (!(await bcrypt.compare(password, user.password_hash))) {
    throw new Error('Invalid password');
  }
  // Generate unique JTIs for tokens
  const jti = crypto.randomUUID();
  const accessToken = jwt.sign(
    { user_id: user.id, username, iss: 'actual-wrapper', aud: 'n8n' }, // Claims
    process.env.JWT_SECRET, // Signing key from env
    { expiresIn: process.env.JWT_ACCESS_TTL || '1h', jwtid: jti } // TTL and ID
  );
  const refreshToken = jwt.sign(
    { user_id: user.id, username, iss: 'actual-wrapper', aud: 'n8n' },
    process.env.JWT_REFRESH_SECRET, // Separate key for refresh
    { expiresIn: process.env.JWT_REFRESH_TTL || '24h', jwtid: `${jti}-refresh` }
  );
  // Track for revocation (no expiration here; pruned separately)
  db.prepare('INSERT INTO tokens (jti) VALUES (?)').run(jti);
  db.prepare('INSERT INTO tokens (jti) VALUES (?)').run(`${jti}-refresh`);
  return { 
    access_token: accessToken, 
    refresh_token: refreshToken, 
    expires_in: ACCESS_TTL / 1000 // Seconds for client
  };
};

/**
 * Revoke a specific token by JTI (e.g., on logout).
 * Marks as revoked; future checks will fail.
 */
const revokeToken = (jti) => {
  pruneExpiredTokens();
  const db = initAuthDB();
  db.prepare('INSERT OR REPLACE INTO tokens (jti, revoked) VALUES (?, true)').run(jti);
  console.log(`Token ${jti} revoked.`);
};

/**
 * Check if a JTI is revoked (for middleware validation).
 * Returns true if revoked or not found.
 */
const isRevoked = (jti) => {
  pruneExpiredTokens();
  const db = initAuthDB();
  const row = db.prepare('SELECT revoked FROM tokens WHERE jti = ?').get(jti);
  return !row || row.revoked === true;
};

/**
 * JWT Authentication Middleware.
 * Extracts Bearer token, verifies signature/JTI, sets req.user.
 * Handles expiration/revocation; rejects with 401 JSON.
 * Async for potential DB checks.
 */
const authenticateJWT = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>
  if (!token) {
    return res.status(401).json({ error: 'Authorization header with Bearer token required' });
  }
  try {
    // Decode without verify first (for JTI check)
    const decoded = jwt.decode(token);
    if (!decoded || isRevoked(decoded.jti)) {
      return res.status(401).json({ error: 'Token revoked or malformed' });
    }
    // Full verify with secret
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // Attach to request (e.g., { user_id, username })
    next(); // Proceed to route handler
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Access token expired. Use refresh token or re-login.' });
    }
    console.error('JWT verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid token signature' });
  }
};

// Exports: All functions for use in server.js
export { 
  authenticateUser, 
  authenticateJWT, 
  revokeToken, 
  ensureAdminUserHash, 
  initAuthDB, 
  pruneExpiredTokens, 
  isRevoked 
};