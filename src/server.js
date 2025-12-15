/**
 * Application entry point.
 * Sets up Express, global middleware, mounts routers, and handles startup/shutdown.
 * Enhanced logging added to the startup sequence for easier debugging.
 */

import express from 'express';
import session from 'express-session';
import authRoutes from './routes/auth.js';
import oauthRoutes from './routes/oauth2.js';
import transactionRoutes from './routes/transactions.js';
import accountRoutes from './routes/accounts.js';
import healthRoutes from './routes/health.js';
import loginRoutes from './routes/login.js';
import { initActualApi, shutdownActualApi } from './services/actualApi.js';
import { ensureAdminUserHash } from './auth/user.js';
import { ensureN8NClient } from './auth/oauth2/client.js';
import { closeDb } from './db/authDb.js';
import { PORT } from './config/index.js';
//import { authenticateUser } from './auth/user.js';
//import { issueTokens } from './auth/jwt.js';

const app = express();

// Global middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: true, maxAge: 60 * 60 * 1000 }, // secure: true in prod
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount routers
app.use('/auth', authRoutes);
app.use('/oauth', oauthRoutes);
app.use('/transactions', transactionRoutes);
app.use('/accounts', accountRoutes);
app.use('/health', healthRoutes);
app.use(loginRoutes); // No prefix – handles root /login GET/POST

/**
 * Sequential startup sequence with detailed logging.
 * This helps identify exactly where a failure occurs (e.g., hash creation, API init, or auth).
 */
await ensureAdminUserHash();
await ensureN8NClient();
await initActualApi();

//(async () => {
//  console.log('=== Beginning startup sequence ===');
//
//  try {
//    //console.log('Step 1: Ensuring admin user password hash...');
//    console.log('Admin user hash successfully created/updated.');
//
//    //console.log('Step 2: Registering default n8n OAuth2 client...');
//    console.log('Default n8n client registered (or already exists).');
//
//    //console.log('Step 3: Initializing Actual Budget API client...');
//    console.log('Actual Budget API client initialized and budget synced.');
//
//    //console.log('Step 4: Generating startup admin token...');
//    const adminPW = process.env.ADMIN_PW;
//    if (!adminPW) {
//      console.warn('ADMIN_PW is not set or empty – cannot generate startup admin token.');
//    } else {
//      //console.log(`ADMIN_PW is set, attempting authentication...`);
//      const username = process.env.ADMIN_USER || 'admin';
//      try {
//        const { userId, username: uname } = await authenticateUser(username, adminPW);
//        console.log(`Authentication successful for user '${uname}' (ID: ${userId}).`);
//
//        //const tokens = issueTokens(userId, uname);
//        console.log('\n=== Startup Complete ===');
//        //console.log(`Admin user ready: ${uname}`);
//        //console.log(`Admin Bearer token (expires in ${process.env.JWT_ACCESS_TTL || '1h'}):`);
//        //console.log(`Bearer ${tokens.access_token}\n`);
//        //console.log(`Refresh token (for /auth/login refresh flow): ${tokens.refresh_token}\n`);
//      } catch (authErr) {
//        console.error('Failed to authenticate admin user during startup:', authErr.message);
//        console.error('This usually means bcrypt password comparison failed (mismatched hash/password).');
//        console.error('Possible causes: env var corruption, trailing whitespace/newlines in ADMIN_PW, or DB issue.');
//      }
//    }
//  } catch (err) {
//    console.error('Critical startup failure (aborting server start):', err.message || err);
//    process.exit(1);
//  }
//
//  console.log('=== Startup sequence finished successfully ===');
//})();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received – shutting down...');
  await shutdownActualApi();
  closeDb();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`\n=== Server running on http://localhost:${PORT} ===`);
  console.log('Endpoints:');
  console.log('  Health:      GET  /health');
  console.log('  Login form:  GET/POST /login');
  console.log('  Auth:        POST /auth/login');
  console.log('  OAuth2:      GET  /oauth/authorize, POST /oauth/token');
  console.log('  Protected:   /accounts, /transactions/*\n');
});