// src/server.js - Updated with all security improvements
/**
 * Application entry point.
 * Sets up Express, global middleware, mounts all routers, and handles startup/shutdown.
 */

import express from 'express';
import session from 'express-session';
import cors from 'cors';
import helmet from 'helmet';
import crypto from 'crypto';
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
import { requestIdMiddleware } from './middleware/requestId.js';
import logger from './logging/logger.js';

const app = express();
const isProd = process.env.NODE_ENV === 'production';

// Trust proxy if behind reverse proxy
if (isProd || process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

// Request ID tracking (first middleware)
app.use(requestIdMiddleware);

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // API doesn't serve HTML
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3000', 'http://localhost:5678'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked request from origin', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  maxAge: 86400, // 24 hours
}));

// Request logging with structured logging
app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - started;
    logger.info('Request completed', {
      requestId: req.id,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  });
  next();
});

// Session configuration with security improvements
if (isProd && !process.env.SESSION_SECRET) {
  logger.error('FATAL: SESSION_SECRET is required in production');
  process.exit(1);
}

const sessionSecret = process.env.SESSION_SECRET || (() => {
  if (!isProd) {
    const secret = crypto.randomBytes(32).toString('hex');
    logger.warn('SESSION_SECRET not set; generated random secret for this session (will be different on restart)');
    return secret;
  }
})();

app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProd,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 1000, // 1 hour
  },
  name: 'sessionId', // Don't use default 'connect.sid'
}));

// Body parsing with size limits
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ limit: '10kb', extended: true }));

// Serve static files (CSS, JS, HTML)
app.use('/static', express.static('./src/public/static'));

// Mount routers
app.use('/auth', authRoutes);
app.use('/health', healthRoutes);
app.use(loginRoutes); // Root /login GET/POST

// Only mount OAuth routes if n8n is configured
let n8nEnabled = false;

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
    logger.info('Starting budget-api server...');
    
    await ensureAdminUserHash();
    
    // Try to set up n8n OAuth2 if configured
    n8nEnabled = await ensureN8NClient();
    if (n8nEnabled) {
      app.use('/oauth', oauthRoutes);
      logger.info('n8n OAuth2 integration enabled');
    } else {
      logger.info('n8n OAuth2 integration disabled (not configured)');
    }
    
    await initActualApi();
    
    logger.info('Startup complete', {
      port: PORT,
      env: process.env.NODE_ENV || 'development',
      n8nOAuth: n8nEnabled,
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
    health: 'GET /health',
    login: 'GET/POST /login',
    auth: 'POST /auth/login, POST /auth/logout',
    oauth2: n8nEnabled ? 'GET /oauth/authorize, POST /oauth/token' : 'disabled',
    docs: 'GET /docs',
    accounts: '/accounts/*',
    transactions: '/transactions/* and /accounts/:accountId/transactions/*',
    categories: '/categories/*',
    categoryGroups: '/category-groups/*',
    payees: '/payees/*',
    budgets: '/budgets/*',
    rules: '/rules/*',
    schedules: '/schedules/*',
    query: 'POST /query',
  });
});