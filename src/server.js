// src/server.js
/**
 * Application entry point (bootstrap only).
 * Builds the app via createApp(), runs startup/shutdown lifecycle, and binds the listener.
 * All Express app construction (middleware, routers) lives in src/app.js.
 */

import { createApp } from './app.js';
import { initActualApi, shutdownActualApi } from './services/actualApi.js';
import { ensureAdminUserHash } from './auth/user.js';
import { closeDb } from './db/authDb.js';
import { closeRedis } from './config/redis.js';
import { PORT, NODE_ENV } from './config/index.js';
import logger from './logging/logger.js';

const app = createApp();

// Startup sequence
(async () => {
  try {
    logger.info('Starting budget-api server...');

    await ensureAdminUserHash();

    // OAuth clients are now managed via admin API
    // No automatic registration on startup
    logger.info('OAuth2 clients can be managed via /admin/oauth-clients endpoints');

    await initActualApi();

    logger.info('Startup complete', {
      port: PORT,
      env: NODE_ENV,
    });
  } catch (err) {
    logger.error('Critical startup failure', { error: err.message, stack: err.stack });
    process.exit(1);
  }
})();

// Graceful shutdown
const shutdown = async (signal) => {
  logger.info(`${signal} received – shutting down gracefully...`);

  try {
    await shutdownActualApi();
    closeDb();
    await closeRedis();
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error('Error during shutdown', { error: err.message });
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
});

app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
  logger.info('Available endpoints:', {
    health: 'GET /v2/health',
    login: 'GET/POST /login',
    auth: 'POST /v2/auth/login, POST /v2/auth/logout',
    oauth2: 'GET /oauth/authorize, POST /oauth/token',
    admin: 'GET /admin/oauth-clients (requires admin JWT)',
    docs: 'GET /docs',
    accounts: '/v2/accounts/*',
    transactions: '/v2/transactions/* and /v2/accounts/:accountId/transactions/*',
    categories: '/v2/categories/*',
    categoryGroups: '/v2/category-groups/*',
    payees: '/v2/payees/*',
    budgets: '/v2/budgets/*',
    rules: '/v2/rules/*',
    schedules: '/v2/schedules/*',
    query: 'POST /v2/query',
  });
});
