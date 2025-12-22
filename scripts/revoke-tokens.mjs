#!/usr/bin/env node
/**
 * Token revocation script for testing.
 * 
 * Usage:
 *   node scripts/revoke-tokens.mjs [command] [options]
 * 
 * Commands:
 *   list              - List all tokens
 *   revoke <jti>      - Revoke a specific token by JTI
 *   revoke-all        - Revoke all tokens (use with caution!)
 *   revoke-access     - Revoke all access tokens
 *   revoke-refresh    - Revoke all refresh tokens
 * 
 * Options:
 *   --db-path <path>  - Specify custom SQLite database path (only for SQLite)
 *   --db-type <type>  - Database type: 'sqlite' or 'postgres' (default: 'sqlite')
 *   --postgres-url <url> - PostgreSQL connection URL
 *   --postgres-host <host> - PostgreSQL host (requires --postgres-db, --postgres-user, --postgres-password)
 *   --postgres-port <port> - PostgreSQL port (default: 5432)
 *   --postgres-db <database> - PostgreSQL database name
 *   --postgres-user <user> - PostgreSQL username
 *   --postgres-password <password> - PostgreSQL password
 */

import Database from 'better-sqlite3';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync } from 'fs';
import readline from 'readline';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

// Default database path (development)
const defaultDbPath = join(projectRoot, 'data', 'dev', 'auth.db');

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];
const jti = args[1];

// Parse options
let dbType = 'sqlite';
let dbPath = defaultDbPath;
let postgresUrl = null;
let postgresConfig = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--db-type' && args[i + 1]) {
    dbType = args[i + 1];
    i++;
  } else if (args[i] === '--db-path' && args[i + 1]) {
    dbPath = resolve(args[i + 1]);
    i++;
  } else if (args[i] === '--postgres-url' && args[i + 1]) {
    postgresUrl = args[i + 1];
    i++;
  } else if (args[i] === '--postgres-host' && args[i + 1]) {
    postgresConfig = postgresConfig || {};
    postgresConfig.host = args[i + 1];
    i++;
  } else if (args[i] === '--postgres-port' && args[i + 1]) {
    postgresConfig = postgresConfig || {};
    postgresConfig.port = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--postgres-db' && args[i + 1]) {
    postgresConfig = postgresConfig || {};
    postgresConfig.database = args[i + 1];
    i++;
  } else if (args[i] === '--postgres-user' && args[i + 1]) {
    postgresConfig = postgresConfig || {};
    postgresConfig.user = args[i + 1];
    i++;
  } else if (args[i] === '--postgres-password' && args[i + 1]) {
    postgresConfig = postgresConfig || {};
    postgresConfig.password = args[i + 1];
    i++;
  }
}

// Initialize database connection
let db = null;
let pgPool = null;

if (dbType === 'postgres') {
  // PostgreSQL mode
  if (postgresUrl) {
    pgPool = new Pool({ connectionString: postgresUrl });
  } else if (postgresConfig && postgresConfig.host && postgresConfig.database && postgresConfig.user && postgresConfig.password) {
    pgPool = new Pool({
      host: postgresConfig.host,
      port: postgresConfig.port || 5432,
      database: postgresConfig.database,
      user: postgresConfig.user,
      password: postgresConfig.password,
    });
  } else {
    console.error('❌ PostgreSQL configuration required when --db-type=postgres');
    console.error('   Provide either --postgres-url or all of: --postgres-host, --postgres-db, --postgres-user, --postgres-password');
    process.exit(1);
  }
  db = pgPool;
} else {
  // SQLite mode
  if (!existsSync(dbPath)) {
    console.error(`❌ Database not found at: ${dbPath}`);
    console.error(`   Make sure the path is correct or use --db-path to specify a custom path.`);
    process.exit(1);
  }
  db = new Database(dbPath);
}

// Helper functions for database queries
const queryRows = async (sql, params = []) => {
  if (dbType === 'postgres') {
    // Convert ? placeholders to $1, $2, etc.
    let paramIndex = 1;
    const pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
    const result = await pgPool.query(pgSql, params);
    return result.rows;
  } else {
    const stmt = db.prepare(sql);
    return stmt.all(...params);
  }
};

const executeUpdate = async (sql, params = []) => {
  if (dbType === 'postgres') {
    let paramIndex = 1;
    const pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
    const result = await pgPool.query(pgSql, params);
    return { changes: result.rowCount || 0 };
  } else {
    const stmt = db.prepare(sql);
    const result = stmt.run(...params);
    return { changes: result.changes || 0 };
  }
};

const closeDb = async () => {
  if (dbType === 'postgres') {
    if (pgPool) {
      await pgPool.end();
    }
  } else {
    if (db) {
      db.close();
    }
  }
};

// Helper functions
async function listTokens() {
  console.log('\n📋 Current Tokens:\n');
  
  // Use database-agnostic date comparison
  const dateComparison = dbType === 'postgres' 
    ? `expires_at < CURRENT_TIMESTAMP`
    : `datetime(expires_at) < datetime('now')`;
  
  const tokens = await queryRows(`
    SELECT 
      jti,
      token_type,
      revoked,
      issued_at,
      expires_at,
      CASE 
        WHEN expires_at IS NULL THEN 'never'
        WHEN ${dateComparison} THEN 'expired'
        ELSE 'active'
      END as status
    FROM tokens
    ORDER BY issued_at DESC
  `);

  if (tokens.length === 0) {
    console.log('  No tokens found.\n');
    return;
  }

  console.log(`  Found ${tokens.length} token(s):\n`);
  tokens.forEach((token, index) => {
    const revokedStatus = (token.revoked === true || token.revoked === 1) ? '❌ REVOKED' : '✅ Active';
    const expiryStatus = token.status === 'expired' ? '⏰ Expired' : token.status === 'active' ? '🕐 Valid' : '∞ Never';
    
    console.log(`  ${index + 1}. JTI: ${token.jti}`);
    console.log(`     Type: ${token.token_type}`);
    console.log(`     Status: ${revokedStatus} | ${expiryStatus}`);
    console.log(`     Issued: ${token.issued_at || 'N/A'}`);
    console.log(`     Expires: ${token.expires_at || 'Never'}`);
    console.log('');
  });
}

async function revokeToken(jti) {
  if (!jti) {
    console.error('❌ Error: JTI required for revoke command');
    console.error('   Usage: node scripts/revoke-tokens.mjs revoke <jti>');
    await closeDb();
    process.exit(1);
  }

  const result = await executeUpdate('UPDATE tokens SET revoked = TRUE WHERE jti = ?', [jti]);

  if (result.changes === 0) {
    console.log(`⚠️  Token with JTI "${jti}" not found.`);
  } else {
    console.log(`✅ Successfully revoked token: ${jti}`);
  }
}

async function revokeAllTokens() {
  const result = await executeUpdate('UPDATE tokens SET revoked = TRUE');
  console.log(`✅ Successfully revoked ${result.changes} token(s).`);
}

async function revokeTokensByType(tokenType) {
  const result = await executeUpdate('UPDATE tokens SET revoked = TRUE WHERE token_type = ?', [tokenType]);
  console.log(`✅ Successfully revoked ${result.changes} ${tokenType} token(s).`);
}

// Main execution
(async () => {
  try {
    console.log(`🔐 Token Revocation Script`);
    console.log(`   Database: ${dbType === 'postgres' ? (postgresUrl || `${postgresConfig.user}@${postgresConfig.host}:${postgresConfig.port || 5432}/${postgresConfig.database}`) : dbPath}\n`);

    switch (command) {
      case 'list':
        await listTokens();
        await closeDb();
        break;

      case 'revoke':
        await revokeToken(jti);
        await listTokens();
        await closeDb();
        break;

      case 'revoke-all': {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        
        rl.question('⚠️  This will revoke ALL tokens. Continue? (yes/no): ', async (answer) => {
          if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
            await revokeAllTokens();
            await listTokens();
          } else {
            console.log('❌ Cancelled.');
          }
          rl.close();
          await closeDb();
        });
        break;
      }

      case 'revoke-access':
        await revokeTokensByType('access');
        await listTokens();
        await closeDb();
        break;

      case 'revoke-refresh':
        await revokeTokensByType('refresh');
        await listTokens();
        await closeDb();
        break;

      default:
        console.error('❌ Invalid command. Available commands:');
        console.error('   list              - List all tokens');
        console.error('   revoke <jti>      - Revoke a specific token by JTI');
        console.error('   revoke-all        - Revoke all tokens');
        console.error('   revoke-access     - Revoke all access tokens');
        console.error('   revoke-refresh    - Revoke all refresh tokens');
        console.error('');
        console.error('Options:');
        console.error('   --db-type <type>  - Database type: sqlite (default) or postgres');
        console.error('   --db-path <path>  - SQLite database path (SQLite only)');
        console.error('   --postgres-url <url> - PostgreSQL connection URL');
        console.error('   --postgres-host <host> - PostgreSQL host');
        console.error('   --postgres-port <port> - PostgreSQL port (default: 5432)');
        console.error('   --postgres-db <database> - PostgreSQL database name');
        console.error('   --postgres-user <user> - PostgreSQL username');
        console.error('   --postgres-password <password> - PostgreSQL password');
        await closeDb();
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    await closeDb();
    process.exit(1);
  }
})();
