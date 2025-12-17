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
import { ensureN8NClient } from './auth/oauth2/client.js';
import { closeDb } from './db/authDb.js';
import { PORT } from './config/index.js';
import { swaggerUi, specs } from './config/swagger.js';
import { authenticateForDocs } from './auth/docsAuth.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();
const isProd = process.env.NODE_ENV === 'production';

if (isProd) {
  app.set('trust proxy', 1);
}

// Basic request logging to trace API calls and durations
app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - started;
    console.log(`[${req.method}] ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Global middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProd,
    httpOnly: true,
    sameSite: isProd ? 'lax' : 'lax',
    maxAge: 60 * 60 * 1000,
  },
}));

if (!process.env.SESSION_SECRET) {
  console.warn('SESSION_SECRET not set; using development fallback.');
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (CSS, JS, HTML)
app.use('/static', express.static('./public/static'));

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

// Swagger API docs (protected with JWT or session auth)
app.use('/docs', authenticateForDocs, swaggerUi.serve, swaggerUi.setup(specs));

// Global error handler (keeps responses consistent)
app.use(errorHandler);

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
  console.log('  Login form:  GET/POST /login (unified endpoint)');
  console.log('  Auth:        POST /auth/login');
  console.log('  OAuth2:      GET  /oauth/authorize, POST /oauth/token');
  console.log('  API Docs:    GET  /docs (login at /login?return_to=/docs)');
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