// Complete server.js (Added mock OAuth server routes for local testing; extensive comments added)
import express from 'express';
import rateLimit from 'express-rate-limit';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
// Import for OAuth2 strategy (handles CommonJS compatibility in ESM)
import passportOauth2 from 'passport-oauth2';
const { OAuth2Strategy } = passportOauth2;
import { authenticateUser, authenticateJWT, ensureAdminUserHash, initAuthDB, revokeToken, isRevoked, pruneExpiredTokens } from './auth.js';

/**
 * Main Express application setup.
 * This server acts as a proxy/wrapper for the Actual Budget API, with JWT-based auth and optional OAuth2 integration.
 * Routes: Auth (login/refresh/OAuth), Transactions (CRUD), Accounts (list), Health check.
 */
const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = '/app/.actual-cache';

/**
 * OAuth2 Configuration Object.
 * Pulled from environment variables with local dev fallbacks.
 * In production, set real provider values (e.g., Google, Auth0) via .env.
 * In mock mode (no OAUTH_CLIENT_ID or matches 'mock-local-client-id'), uses internal mock server for end-to-end testing.
 * Mock allows simulating full OAuth flow locally without external services.
 */
const OAUTH_CONFIG = {
  clientID: process.env.OAUTH_CLIENT_ID || 'mock-local-client-id',
  clientSecret: process.env.OAUTH_CLIENT_SECRET || 'mock-local-secret',
  authorizeURL: process.env.OAUTH_AUTHORIZE_URL || 'http://localhost:3000/mock-oauth/authorize',
  tokenURL: process.env.OAUTH_TOKEN_URL || 'http://localhost:3000/mock-oauth/token',
  callbackURL: process.env.OAUTH_CALLBACK_URL || `http://localhost:${PORT}/auth/oauth/callback`,
  scope: process.env.OAUTH_SCOPE || 'openid profile email', // Space-separated scopes; adjust per provider
  userProfileURL: process.env.OAUTH_USER_PROFILE_URL || 'http://localhost:3000/mock-oauth/userinfo',
  successRedirect: process.env.OAUTH_SUCCESS_REDIRECT || `http://localhost:${PORT}/dashboard`, // Where to redirect after successful auth (e.g., your frontend)
};

/**
 * Rate limiting middleware for login endpoint to prevent brute-force attacks.
 * Config: 5 attempts per 15 minutes.
 */
const loginLimiter = rateLimit({ 
  windowMs: 15 * 60 * 1000, 
  max: 5, 
  message: { error: 'Too many login attempts. Try again later.' } 
});

// Global middleware: JSON parsing and Passport initialization (for OAuth sessions if needed)
app.use(express.json());
app.use(passport.initialize()); // Enables Passport for OAuth flows

/**
 * Enhanced /auth/login POST endpoint.
 * Supports two flows:
 * 1. Username/password login (traditional basic auth).
 * 2. Refresh token exchange (for renewing access tokens without re-login).
 * Rate-limited for security.
 */
app.post('/auth/login', loginLimiter, async (req, res) => {
  const { username, password, refresh_token } = req.body;

  // Flow 1: Refresh token validation and new access token issuance
  if (refresh_token && !username && !password) {
    try {
      // Verify the refresh token's signature and payload
      const decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
      const jti = decoded.jti; // JWT ID for revocation check
      if (isRevoked(jti)) { // Check if token was explicitly revoked
        return res.status(401).json({ error: 'Refresh token has been revoked' });
      }
      // Generate new access token with refreshed expiration; keep same user claims
      const newJti = crypto.randomUUID(); // Fresh JTI for the new access token
      const accessToken = jwt.sign(
        { user_id: decoded.user_id, username: decoded.username, iss: 'actual-wrapper', aud: 'n8n' },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_ACCESS_TTL || '1h', jwtid: newJti } // 1h default TTL
      );
      // Store new access token's JTI (refresh remains valid for multi-use)
      const db = initAuthDB();
      db.prepare('INSERT INTO tokens (jti) VALUES (?)').run(newJti);
      console.log(`Access token refreshed for user '${decoded.username}' from IP ${req.ip}`);
      return res.json({
        access_token: accessToken,
        expires_in: parseInt(process.env.JWT_ACCESS_TTL) || 3600, // Seconds
        token_type: 'Bearer'
      });
    } catch (error) {
      console.error(`Refresh token validation failed from IP ${req.ip}:`, error.message);
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
  }

  // Flow 2: Standard username/password authentication
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required (or provide a refresh_token for renewal)' });
  }
  try {
    const result = await authenticateUser(username, password); // Handles user lookup, hashing, and token issuance
    console.log(`Login successful for user '${username}' from IP ${req.ip}`);
    res.json(result); // { access_token, refresh_token, expires_in }
  } catch (error) {
    console.error(`Login failed for user '${username}' from IP ${req.ip}:`, error.message);
    res.status(401).json({ error: 'Invalid username or password' });
  }
});

/**
 * Mock OAuth2 Provider Server (for local development/testing only).
 * Simulates a full OAuth2 authorization server when OAUTH_CLIENT_ID is not set (mock mode).
 * Routes:
 * - /mock-oauth/authorize: Handles authorization code grant (GET with params).
 * - /mock-oauth/token: Exchanges code for tokens (POST).
 * - /mock-oauth/userinfo: Returns mock user profile (GET with Bearer token).
 * This allows end-to-end testing of the OAuth flow without a real provider (e.g., Google).
 * In production, these are unused; real config takes over.
 * Security: For testing only—hardcoded credentials and no real crypto.
 */
if (OAUTH_CONFIG.clientID === 'mock-local-client-id') {
  console.log('Initializing Mock OAuth2 Provider for local testing...');

  // Mock in-memory storage for auth codes and tokens (in prod, use Redis/DB)
  const mockCodes = new Map(); // code -> { client_id, redirect_uri, scope, user }
  const mockTokens = new Map(); // access_token -> { user, refresh_token, expires_at }

  // GET /mock-oauth/authorize: Simulate user consent and issue auth code
  app.get('/mock-oauth/authorize', (req, res) => {
    const { client_id, redirect_uri, scope, state, response_type = 'code' } = req.query;
    if (response_type !== 'code') {
      return res.status(400).json({ error: 'Unsupported response_type; use "code"' });
    }
    console.log(`Mock authorize request for client_id=${client_id}, redirect_uri=${redirect_uri}`);
    console.log(OAUTH_CONFIG)
    if (client_id !== OAUTH_CONFIG.clientID || !redirect_uri) {
      return res.status(400).json({ error: 'Invalid client_id or redirect_uri' });
    }
    // Simulate consent: Hardcode a mock user (in real flow, show UI/login)
    const mockUser = {
      id: 'mock-user-123',
      email: 'test@example.com',
      name: 'Test User',
      sub: 'mock-sub-456' // Subject ID
    };
    // Generate random auth code (expires in 10min for testing)
    const authCode = crypto.randomBytes(16).toString('hex');
    mockCodes.set(authCode, { 
      client_id, 
      redirect_uri, 
      scope: scope.split(' '), 
      user: mockUser, 
      expires_at: Date.now() + 10 * 60 * 1000 
    });
    // Redirect to callback with code (and state if provided)
    const redirectUrl = `${redirect_uri}?code=${authCode}${state ? `&state=${state}` : ''}`;
    console.log(`Mock authorize: Issued code ${authCode} for user ${mockUser.email}`);
    res.redirect(redirectUrl);
  });

  // POST /mock-oauth/token: Exchange code for access/refresh tokens
  app.post('/mock-oauth/token', express.urlencoded({ extended: true }), (req, res) => {
    const { grant_type, code, client_id, client_secret, redirect_uri } = req.body;
    if (grant_type !== 'authorization_code') {
      return res.status(400).json({ error: 'Unsupported grant_type; use "authorization_code"' });
    }
    if (client_id !== OAUTH_CONFIG.clientID || client_secret !== OAUTH_CONFIG.clientSecret) {
      return res.status(401).json({ error: 'Invalid client credentials' });
    }
    // Validate code
    const codeData = mockCodes.get(code);
    if (!codeData || Date.now() > codeData.expires_at || codeData.redirect_uri !== redirect_uri) {
      return res.status(400).json({ error: 'Invalid or expired authorization code' });
    }
    // Issue tokens (short-lived access, longer refresh; no real signing for mock)
    const accessToken = crypto.randomBytes(32).toString('hex');
    const refreshToken = crypto.randomBytes(32).toString('hex');
    const expiresIn = 3600; // 1h
    mockTokens.set(accessToken, {
      user: codeData.user,
      refresh_token: refreshToken,
      expires_at: Date.now() + expiresIn * 1000
    });
    // Clean up used code
    mockCodes.delete(code);
    console.log(`Mock token: Issued tokens for user ${codeData.user.email}`);
    res.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      scope: codeData.scope.join(' ')
    });
  });

  // GET /mock-oauth/userinfo: Return user profile (protected by Bearer token)
  app.get('/mock-oauth/userinfo', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Bearer token required' });
    }
    const accessToken = authHeader.split(' ')[1];
    const tokenData = mockTokens.get(accessToken);
    if (!tokenData || Date.now() > tokenData.expires_at) {
      return res.status(401).json({ error: 'Invalid or expired access token' });
    }
    console.log(`Mock userinfo: Served profile for user ${tokenData.user.email}`);
    res.json(tokenData.user); // { id, email, name, sub }
  });

  console.log('Mock OAuth2 Provider ready at /mock-oauth/*');
} else {
  /**
   * Real OAuth2 Setup with Passport.js.
   * Uses generic OAuth2Strategy for any provider (e.g., Google, GitHub).
   * Flow: /auth/oauth → provider authorize → callback → exchange code → fetch profile → issue JWTs.
   * Only initializes if non-mock config provided.
   */
  passport.use('oauth2', new OAuth2Strategy(
    {
      clientID: OAUTH_CONFIG.clientID,
      clientSecret: OAUTH_CONFIG.clientSecret,
      authorizationURL: OAUTH_CONFIG.authorizeURL,
      tokenURL: OAUTH_CONFIG.tokenURL,
      callbackURL: OAUTH_CONFIG.callbackURL,
      scope: OAUTH_CONFIG.scope.split(' '),
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Fetch detailed user profile from provider's userinfo endpoint
        const profileResponse = await fetch(OAUTH_CONFIG.userProfileURL, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!profileResponse.ok) {
          throw new Error(`Profile fetch failed: ${profileResponse.status}`);
        }
        const userProfile = await profileResponse.json();
        // Derive username from profile (prioritize email, then sub/ID)
        const username = userProfile.email || userProfile.sub || `oauth_${userProfile.id || userProfile.user_id}`;
        const db = initAuthDB();
        // UPSERT user as OAuth-linked (no password; flag for special handling)
        const insertStmt = db.prepare(`
          INSERT INTO users (username, password_hash, is_active, oauth_provider)
          VALUES (?, 'OAUTH', TRUE, ?)
          ON CONFLICT(username) DO UPDATE SET 
            is_active = TRUE, 
            oauth_provider = excluded.oauth_provider
        `);
        insertStmt.run(username, 'generic'); // 'generic' or provider-specific (e.g., 'google')
        // Retrieve or get new user ID
        const userRow = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        const userId = userRow.id;
        // Issue internal JWTs (access/refresh) for app use
        const jti = crypto.randomUUID();
        const accessTokenJWT = jwt.sign(
          { user_id: userId, username, iss: 'actual-wrapper', aud: 'n8n' },
          process.env.JWT_SECRET,
          { expiresIn: process.env.JWT_ACCESS_TTL || '1h', jwtid: jti }
        );
        const refreshTokenJWT = jwt.sign(
          { user_id: userId, username, iss: 'actual-wrapper', aud: 'n8n' },
          process.env.JWT_REFRESH_SECRET,
          { expiresIn: process.env.JWT_REFRESH_TTL || '24h', jwtid: `${jti}-refresh` }
        );
        // Track tokens for revocation
        db.prepare('INSERT INTO tokens (jti) VALUES (?)').run(jti);
        db.prepare('INSERT INTO tokens (jti) VALUES (?)').run(`${jti}-refresh`);
        console.log(`OAuth success: Tokens issued for user '${username}'`);
        return done(null, { access_token: accessTokenJWT, refresh_token: refreshTokenJWT });
      } catch (error) {
        console.error('OAuth profile processing error:', error);
        return done(error);
      }
    }
  ));

  // GET /auth/oauth: Start OAuth flow (redirect to provider's authorize URL)
  app.get('/auth/oauth', passport.authenticate('oauth2', { 
    // Optional: Pass state for CSRF protection (generate/store in session if using express-session)
  }));

  // GET /auth/oauth/callback: Handle provider redirect, exchange code, issue JWTs, redirect to client
  app.get('/auth/oauth/callback',
    passport.authenticate('oauth2', { failureRedirect: '/auth/oauth/error' }),
    (req, res) => {
      const tokens = req.user; // { access_token, refresh_token } from strategy
      // Redirect to success URL with tokens in query params (use HTTPS in prod; consider fragments or sessions)
      const redirectUrl = `${OAUTH_CONFIG.successRedirect}?access_token=${tokens.access_token}&refresh_token=${tokens.refresh_token}`;
      res.redirect(redirectUrl);
    }
  );

  // GET /auth/oauth/error: Handle auth failures (e.g., invalid code, user denied consent)
  app.get('/auth/oauth/error', (req, res) => {
    console.error('OAuth flow failed:', req.query.error || 'Unknown error');
    res.status(401).json({ error: 'OAuth authentication failed. Please try again.' });
  });

  console.log('Real OAuth2 integration enabled with Passport.js');
}

// JWT-protected middleware for sensitive routes (e.g., /transactions, /accounts)
app.use('/transactions', authenticateJWT);
app.use('/accounts', authenticateJWT);

/**
 * Initialize Actual Budget API client.
 * Downloads budget data on startup for caching/sync.
 * Exits on failure (e.g., invalid server URL/password).
 */
let api; // Global API instance for reuse across requests
try {
  const { default: apiImport } = await import('@actual-app/api');
  api = apiImport;
  // Init with encrypted/persistent data dir and remote sync creds
  await api.init({ 
    dataDir: DATA_DIR, 
    serverURL: process.env.ACTUAL_SERVER_URL, 
    password: process.env.ACTUAL_PASSWORD 
  });
  await api.downloadBudget(process.env.ACTUAL_SYNC_ID); // Initial budget sync
  console.log('Actual Budget API initialized successfully from encrypted env vars.');
} catch (error) {
  console.error('Failed to initialize Actual API:', error.message);
  process.exit(1); // Hard exit on core dependency failure
}

/**
 * POST /transactions/:accountId: Add transactions to a specific account.
 * Requires JWT auth. Supports optional accountId param or fallback to STRIKE_ACCOUNT_ID env.
 * Syncs changes and returns updated budget snapshot.
 */
app.post('/transactions/:accountId', async (req, res) => {
  const { accountId } = req.params;
  const { transactions } = req.body; // Array of tx objects { date, amount, payee, ... }
  const targetAccountId = accountId || process.env.ACTUAL_STRIKE_ACCOUNT_ID;
  if (!targetAccountId) {
    return res.status(400).json({ error: 'Account ID required (param or ACTUAL_STRIKE_ACCOUNT_ID env)' });
  }
  console.log(`Adding ${transactions?.length || 0} transactions to account '${targetAccountId}' by user '${req.user?.username}'`);
  if (!transactions || !Array.isArray(transactions)) {
    return res.status(400).json({ error: 'Request body must include a valid transactions array' });
  }
  try {
    // Map transactions to Actual API format (inject account ID)
    const txs = transactions.map(tx => ({ account: targetAccountId, ...tx }));
    await api.addTransactions(targetAccountId, txs); // Bulk add
    await api.sync(); // Push changes to remote
    const updatedBudget = await api.getTransactions(targetAccountId); // Fetch fresh data
    res.status(201).json({ 
      success: true, 
      accountId: targetAccountId, 
      addedCount: txs.length, 
      updatedBudget 
    });
  } catch (error) {
    console.error(`Transaction add failed for account '${targetAccountId}':`, error.message);
    res.status(500).json({ error: `API error: ${error.message}` });
  }
});

/**
 * GET /transactions/:accountId: Fetch transactions for an account.
 * Requires JWT auth. Syncs before query for freshness.
 */
app.get('/transactions/:accountId', async (req, res) => {
  const { accountId } = req.params;
  const targetAccountId = accountId || process.env.ACTUAL_STRIKE_ACCOUNT_ID;
  if (!targetAccountId) {
    return res.status(400).json({ error: 'Account ID required (param or ACTUAL_STRIKE_ACCOUNT_ID env)' });
  }
  console.log(`Fetching transactions for account '${targetAccountId}' by user '${req.user?.username}'`);
  try {
    await api.sync(); // Ensure latest remote data
    const txs = await api.getTransactions(targetAccountId);
    res.json({ 
      success: true, 
      accountId: targetAccountId, 
      transactions: txs 
    });
  } catch (error) {
    console.error(`Transaction fetch failed for account '${targetAccountId}':`, error.message);
    res.status(500).json({ error: `API error: ${error.message}` });
  }
});

/**
 * GET /accounts: List all accounts from Actual Budget.
 * Requires JWT auth. Syncs before query.
 */
app.get('/accounts', async (req, res) => {
  console.log(`Fetching all accounts by user '${req.user?.username}'`);
  try {
    await api.sync();
    const accounts = await api.getAccounts();
    res.json({ success: true, accounts });
  } catch (error) {
    console.error('Accounts fetch failed:', error.message);
    res.status(500).json({ error: `API error: ${error.message}` });
  }
});

/**
 * GET /health: Basic health check endpoint.
 * Reports API init status, OAuth mode, and active user count.
 * No auth required for monitoring.
 */
app.get('/health', (req, res) => {
  const db = initAuthDB();
  const activeUsers = db.prepare('SELECT COUNT(*) as c FROM users WHERE is_active = 1').get().c || 0;
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    api_initialized: !!api,
    oauth_enabled: OAUTH_CONFIG.clientID !== 'mock-local-client-id',
    mock_oauth_mode: OAUTH_CONFIG.clientID === 'mock-local-client-id',
    active_users: activeUsers,
    data_dir: DATA_DIR
  });
});

/**
 * Startup sequence: Ensure admin user exists and generate sample token.
 * Runs async after server listen for non-blocking init.
 */
ensureAdminUserHash(); // Syncs admin hash from env (exits if no ADMIN_PW)
(async () => {
  try {
    const adminUsername = process.env.ADMIN_USER || 'admin';
    const adminPW = process.env.ADMIN_PW;
    if (adminPW) {
      const result = await authenticateUser(adminUsername, adminPW);
      console.log(`\n=== Startup Complete ===`);
      console.log(`Admin login token (expires in ${process.env.JWT_ACCESS_TTL || '1h'}):`);
      console.log(`Bearer ${result.access_token}`);
      console.log(`Use for initial API calls (e.g., n8n workflows). Refresh via /auth/login with refresh_token.\n`);
    } else {
      console.warn('ADMIN_PW not set; manual login required via /auth/login');
    }
  } catch (error) {
    console.error('Admin auto-token generation failed:', error.message);
  }
})();

/**
 * Graceful shutdown handler.
 * Closes API connection and DB on SIGTERM (e.g., Docker stop).
 */
process.on('SIGTERM', async () => {
  console.log('Shutdown signal received; cleaning up...');
  if (api) {
    await api.shutdown();
    console.log('Actual API shutdown complete.');
  }
  const db = initAuthDB();
  if (db) {
    db.close();
    console.log('Auth DB closed.');
  }
  process.exit(0);
});

// Start the server
app.listen(PORT, () => {
  console.log(`\n=== Server Listening ===`);
  console.log(`Proxy server running on http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`Login: POST http://localhost:${PORT}/auth/login`);
  console.log(`OAuth Start: GET http://localhost:${PORT}/auth/oauth (if enabled)`);
  console.log(`Protected: /accounts, /transactions/*`);
  console.log(`Data persistence: ${DATA_DIR}\n`);
});