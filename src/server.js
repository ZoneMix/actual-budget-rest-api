// src/server.js - Updated with all new route mounts
/**
 * Application entry point.
 * Sets up Express, global middleware, mounts all routers, and handles startup/shutdown.
 */

import express from 'express';
import session from 'express-session';
import authRoutes from './routes/auth.js';
import oauthRoutes from './routes/oauth2.js';
import accountsRoutes from './routes/accounts.js';
import transactionsGlobalRoutes from './routes/transactions-global.js';
import transactionsNestedRoutes from './routes/transactions-nested.js';
import categoriesRoutes from './routes/categories.js';
import categoryGroupsRoutes from './routes/category-groups.js';
import payeesRoutes from './routes/payees.js';
import budgetsRoutes from './routes/budgets.js';
import rulesRoutes from './routes/rules.js';
import schedulesRoutes from './routes/schedules.js';
import queryRoutes from './routes/query.js';
import healthRoutes from './routes/health.js';
import loginRoutes from './routes/login.js';
import { initActualApi, shutdownActualApi } from './services/actualApi.js';
import { ensureAdminUserHash } from './auth/user.js';
import docsAuthRoutes from './auth/docsAuth.js';
import { ensureN8NClient } from './auth/oauth2/client.js';  // Adjust if renamed
import { closeDb } from './db/authDb.js';
import { PORT } from './config/index.js';
import { swaggerUi, specs } from './config/swagger.js';

const app = express();

// Global middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 60 * 60 * 1000 }, // secure: true in prod
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount routers
app.use('/auth', authRoutes);
app.use('/oauth', oauthRoutes);
app.use('/health', healthRoutes);
app.use(loginRoutes); // Root /login GET/POST

app.use('/accounts', accountsRoutes);
app.use('/transactions', transactionsGlobalRoutes); // Global update/delete by ID

// Nested per-account transactions (mounted under accounts)
accountsRoutes.use('/:accountId/transactions', transactionsNestedRoutes);

app.use('/categories', categoriesRoutes);
app.use('/category-groups', categoryGroupsRoutes);
app.use('/payees', payeesRoutes);
app.use('/budgets', budgetsRoutes);
app.use('/rules', rulesRoutes);
app.use('/schedules', schedulesRoutes);
app.use('/query', queryRoutes);

// API docs authentication routes
app.use('/docs', docsAuthRoutes);

// Swagger API docs (protected with JWT or session auth)
app.use('/docs', authenticateForDocs, swaggerUi.serve, swaggerUi.setup(specs));

// Startup sequence
(async () => {
  try {
    await ensureAdminUserHash();
    await ensureN8NClient();
    await initActualApi();
    console.log('=== Startup complete ===');
  } catch (err) {
    console.error('Critical startup failure:', err);
    process.exit(1);
  }
})();

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
  console.log('  API Docs:    GET  /docs (login at /docs/login)');
  console.log('  API Docs Login: GET/POST /docs/login');
  console.log('  Accounts:    /accounts/*');
  console.log('  Transactions:/transactions/* and /accounts/:accountId/transactions/*');
  console.log('  Categories:  /categories/*');
  console.log('  Category Groups: /category-groups/*');
  console.log('  Payees:      /payees/*');
  console.log('  Budgets:     /budgets/*');
  console.log('  Rules:       /rules/*');
  console.log('  Schedules:   /schedules/*');
  console.log('  Query:       POST /query\n');
});