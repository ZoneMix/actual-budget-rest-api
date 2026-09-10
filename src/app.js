// src/app.js
/**
 * Express application builder.
 * Assembles the app (global middleware, routers, error handler) without
 * starting a listener or running the startup/shutdown sequence — that
 * bootstrap lives in src/server.js. Keeping app construction separate lets
 * tests (supertest) exercise the real middleware stack without binding a port.
 */

import express from 'express';
import session from 'express-session';
import cors from 'cors';
import helmet from 'helmet';
import crypto from 'crypto';
import authRoutes from './routes/auth.js';
import oauthRoutes from './routes/oauth2.js';
import adminRoutes from './routes/admin.js';
import accountsRoutes from './routes/accounts.js';
import transactionsGlobalRoutes from './routes/transactions-global.js';
import categoriesRoutes from './routes/categories.js';
import categoryGroupsRoutes from './routes/category-groups.js';
import payeesRoutes from './routes/payees.js';
import budgetsRoutes from './routes/budgets.js';
import rulesRoutes from './routes/rules.js';
import schedulesRoutes from './routes/schedules.js';
import queryRoutes from './routes/query.js';
import healthRoutes from './routes/health.js';
import loginRoutes from './routes/login.js';
import { NODE_ENV, TRUST_PROXY, ALLOWED_ORIGINS, MAX_REQUEST_SIZE } from './config/index.js';
import env from './config/env.js';
import { swaggerUi, setupDynamicSwaggerUi } from './config/swagger.js';
import { authenticateForDocs } from './auth/docsAuth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { metricsMiddleware } from './middleware/metrics.js';
import metricsRoutes from './routes/metrics.js';
import logger from './logging/logger.js';

/**
 * Builds and configures the Express application.
 * Same middleware order as production; does not call app.listen().
 */
export const createApp = () => {
  const app = express();
  const isProd = NODE_ENV === 'production';

  // Trust proxy if behind reverse proxy
  if (isProd || TRUST_PROXY) {
    app.set('trust proxy', 1);
  }

  // Request ID tracking (first middleware)
  app.use(requestIdMiddleware);

  // Metrics collection (second middleware, after request ID)
  app.use(metricsMiddleware);

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
  const allowedOrigins = ALLOWED_ORIGINS;

  // Log configured origins on startup
  logger.info('CORS configuration', {
    allowedOrigins,
    originCount: allowedOrigins.length,
  });

  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn('CORS blocked request from origin', {
          origin,
          allowedOrigins,
          hint: 'Add the origin to ALLOWED_ORIGINS environment variable'
        });
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
  // SESSION_SECRET is validated in env.js, but we need a fallback for development
  const sessionSecret = env.SESSION_SECRET || (() => {
    if (!isProd) {
      const secret = crypto.randomBytes(32).toString('hex');
      logger.warn('SESSION_SECRET not set; generated random secret for this session (will be different on restart)');
      return secret;
    }
    // This should never happen due to env validation, but just in case
    throw new Error('SESSION_SECRET is required');
  })();

  app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProd, // HTTPS only in production
      httpOnly: true, // Prevent XSS access to cookie
      sameSite: isProd ? 'strict' : 'lax', // Strict in production for better CSRF protection
      maxAge: 60 * 60 * 1000, // 1 hour
    },
    name: 'sessionId', // Don't use default 'connect.sid'
  }));

  // Body parsing with size limits
  // Default limit for most routes (can be overridden per-route)
  app.use(express.json({ limit: MAX_REQUEST_SIZE }));
  app.use(express.urlencoded({ limit: MAX_REQUEST_SIZE, extended: true }));

  // Serve static files (CSS, JS, HTML)
  app.use('/static', express.static('./src/public/static'));

  // Mount routers
  // API v2 routes (prefixed with /v2)
  app.use('/v2/auth', authRoutes);
  app.use('/v2/health', healthRoutes);
  app.use('/v2/metrics', metricsRoutes); // Metrics endpoints (protected in production)
  app.use('/v2/accounts', accountsRoutes);
  app.use('/v2/transactions', transactionsGlobalRoutes); // Global update/delete by ID
  // Nested per-account transactions (/:accountId/transactions) are mounted
  // once at module load inside src/routes/accounts.js, not here.

  app.use('/v2/categories', categoriesRoutes);
  app.use('/v2/category-groups', categoryGroupsRoutes);
  app.use('/v2/payees', payeesRoutes);
  app.use('/v2/budgets', budgetsRoutes);
  app.use('/v2/rules', rulesRoutes);
  app.use('/v2/schedules', schedulesRoutes);
  app.use('/v2/query', queryRoutes);

  // Non-versioned routes (no /v2 prefix)
  app.use(loginRoutes); // Root /login GET/POST
  app.use('/admin', adminRoutes); // Admin endpoints (require admin JWT)
  app.use('/oauth', oauthRoutes); // OAuth routes (clients can be created via admin API)

  // Swagger API docs (protected with JWT or session auth)
  // Use dynamic specs to get the correct server URL based on the request (works behind proxies)
  app.use('/docs', authenticateForDocs, swaggerUi.serve, setupDynamicSwaggerUi);

  // Global error handler (keeps responses consistent)
  app.use(errorHandler);

  return app;
};
