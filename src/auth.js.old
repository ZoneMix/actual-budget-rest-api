// Complete auth.js (Added OAuth2 server support: clients/codes tables, validation, scope enforcement; full merged code)
import bcrypt from 'bcrypt'; // For secure password hashing
import jwt from 'jsonwebtoken'; // For JWT signing/verification
import crypto from 'crypto'; // For UUIDs and random tokens
import Database from 'better-sqlite3'; // Lightweight, synchronous SQLite wrapper

/**
 * Constants for auth system.
 * DATA_DIR: Matches server.js for shared .actual-cache volume.
 * AUTH_DB_PATH: SQLite file for users/tokens (encrypted if DB_MASTER_KEY set).
 */
const DATA_DIR = '/app/.actual-cache';
const AUTH_DB_PATH = `${DATA_DIR}/auth.db`;

// Helper to parse expiresIn strings/numbers into seconds (aligns with jwt.sign format)
const parseExpiresInToSeconds = (expiresInStr) => {
  if (!expiresInStr) return 3600; // Default 1h in seconds

  // First, try unit-based parsing (e.g., '1h', '30m')
  const unitMatch = expiresInStr.toLowerCase().match(/^(\d+)([smhd])$/);
  if (unitMatch) {
    const value = parseInt(unitMatch[1], 10);
    const unit = unitMatch[2];
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
    if (multipliers[unit]) {
      return value * multipliers[unit];
    }
  }

  // Fallback: plain number (assumed seconds, e.g., '3600')
  const num = parseInt(expiresInStr, 10);
  if (!isNaN(num)) return num;

  throw new Error(`Invalid JWT_ACCESS_TTL: "${expiresInStr}". Use e.g., '1h', '3600', or '30m'.`);
};

const ACCESS_TTL_SECONDS = parseExpiresInToSeconds(process.env.JWT_ACCESS_TTL || '1h');
console.log(`Parsed TTL: ${ACCESS_TTL_SECONDS}s from "${process.env.JWT_ACCESS_TTL || 'default'}"`);

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

  // NEW: Clients table for OAuth2 clients (e.g., n8n)
  authDB.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      client_id TEXT PRIMARY KEY,
      client_secret TEXT NOT NULL,
      allowed_scopes TEXT DEFAULT 'api',  -- Comma-separated scopes
      redirect_uris TEXT,  -- Comma-separated allowed URIs
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // NEW: Auth codes table (short-lived for Authorization Code Grant)
  authDB.exec(`
    CREATE TABLE IF NOT EXISTS auth_codes (
      code TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      redirect_uri TEXT NOT NULL,
      scope TEXT,  -- Requested scopes
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
 * Uses ACCESS_TTL_SECONDS for expiration calc.
 */
const pruneExpiredTokens = () => {
  const db = initAuthDB();
  const stmt = db.prepare(`
    DELETE FROM tokens
    WHERE datetime(issued_at, '+${ACCESS_TTL_SECONDS} seconds') < datetime('now')
  `);
  const deletedCount = stmt.run().changes; // Track deletions
  if (deletedCount > 0) {
    console.log(`Pruned ${deletedCount} expired tokens.`);
  }
};

// NEW: Prune expired auth codes (10min TTL)
const pruneExpiredCodes = () => {
  const db = initAuthDB();
  db.prepare(`
    DELETE FROM auth_codes
    WHERE datetime(expires_at) < datetime('now')
  `).run();
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
    { expiresIn: `${ACCESS_TTL_SECONDS}s`, jwtid: jti } // TTL and ID (seconds string)
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
    expires_in: ACCESS_TTL_SECONDS // Seconds for client
  };
};

// NEW: Validate client (by id/secret)
const validateClient = (clientId, clientSecret) => {
  pruneExpiredCodes();
  const db = initAuthDB();
  const client = db.prepare('SELECT * FROM clients WHERE client_id = ?').get(clientId);
  if (!client || client.client_secret !== clientSecret) {
    throw new Error('Invalid client credentials');
  }
  return client;
};

// NEW: Generate and store auth code
const generateAuthCode = (clientId, userId, redirectUri, scope = 'api') => {
  pruneExpiredCodes();
  const code = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10min
  const db = initAuthDB();
  db.prepare(`
    INSERT INTO auth_codes (code, client_id, user_id, redirect_uri, scope, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(code, clientId, userId, redirectUri, scope, expiresAt);
  return code;
};

// NEW: Validate and consume auth code
const validateAuthCode = (code, clientId, redirectUri) => {
  pruneExpiredCodes();
  const db = initAuthDB();
  const row = db.prepare(`
    SELECT user_id, scope FROM auth_codes 
    WHERE code = ? AND client_id = ? AND redirect_uri = ?
  `).get(code, clientId, redirectUri);
  if (!row) {
    throw new Error('Invalid or expired authorization code');
  }
  // Consume (delete) code
  db.prepare('DELETE FROM auth_codes WHERE code = ?').run(code);
  return { userId: row.user_id, scope: row.scope };
};

// NEW: Register default n8n client on init (if not exists)
const ensureN8nClient = () => {
  const db = initAuthDB();
  const n8nClientId = process.env.N8N_CLIENT_ID || 'n8n';
  const n8nSecret = process.env.N8N_CLIENT_SECRET || 'n8n_secret';
  const existing = db.prepare('SELECT client_id FROM clients WHERE client_id = ?').get(n8nClientId);
  if (!existing) {
    db.prepare(`
      INSERT INTO clients (client_id, client_secret, allowed_scopes, redirect_uris)
      VALUES (?, ?, 'api', 'http://localhost:5678/rest/oauth2-credential/callback')
    `).run(n8nClientId, n8nSecret);
    console.log(`Registered default n8n client: ${n8nClientId}`);
  }
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

    // Scope enforcement (e.g., for /accounts require 'api')
    const requiredScope = req.path.startsWith('/accounts') ? 'api' : '*'; // Expand as needed
    const tokenScopes = payload.scope || 'api'; // Add scope to JWT on issue
    if (requiredScope !== '*' && !tokenScopes.includes(requiredScope)) {
      return res.status(403).json({ error: 'Insufficient scopes' });
    }

    next(); // Proceed to route handler
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Access token expired. Use refresh token or re-login.' });
    }
    console.error('JWT verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid token signature' });
  }
};

// NEW: Issue tokens from OAuth flow (reuse authenticateUser logic, but add scope to payload)
const issueTokensFromOAuth = async (userId, username, scope) => {
  pruneExpiredTokens();
  const db = initAuthDB();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) throw new Error('User not found');

  const jti = crypto.randomUUID();
  const accessToken = jwt.sign(
    { user_id: userId, username, iss: 'actual-wrapper', aud: 'n8n', scope }, // Add scope
    process.env.JWT_SECRET,
    { expiresIn: `${ACCESS_TTL_SECONDS}s`, jwtid: jti }
  );
  const refreshToken = jwt.sign(
    { user_id: userId, username, iss: 'actual-wrapper', aud: 'n8n' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_TTL || '24h', jwtid: `${jti}-refresh` }
  );
  db.prepare('INSERT INTO tokens (jti) VALUES (?)').run(jti);
  db.prepare('INSERT INTO tokens (jti) VALUES (?)').run(`${jti}-refresh`);
  return { 
    access_token: accessToken, 
    refresh_token: refreshToken, 
    expires_in: ACCESS_TTL_SECONDS,
    token_type: 'Bearer',
    scope
  };
};

// Exports: All functions for use in server.js
export { 
  authenticateUser, 
  authenticateJWT, 
  revokeToken, 
  ensureAdminUserHash, 
  initAuthDB, 
  pruneExpiredTokens, 
  isRevoked,
  // NEW
  ensureN8nClient,
  validateClient,
  generateAuthCode,
  validateAuthCode,
  issueTokensFromOAuth,
  pruneExpiredCodes
};