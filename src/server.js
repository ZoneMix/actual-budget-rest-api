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