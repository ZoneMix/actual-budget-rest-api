// Complete server.js (Added OAuth2 Authorization Server for n8n: /oauth/authorize, /oauth/token, sessions; full merged code)
import express from 'express';
import session from 'express-session'; // For consent/login state
import rateLimit from 'express-rate-limit';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
// Import for OAuth2 strategy (handles CommonJS compatibility in ESM) - kept for potential client-side use
import passportOauth2 from 'passport-oauth2';
const { OAuth2Strategy } = passportOauth2;
import { 
  authenticateUser, 
  authenticateJWT, 
  ensureAdminUserHash, 
  initAuthDB, 
  revokeToken, 
  isRevoked, 
  pruneExpiredTokens,
  // NEW for OAuth server
  ensureN8nClient,
  validateClient,
  generateAuthCode,
  validateAuthCode,
  issueTokensFromOAuth,
  pruneExpiredCodes
} from './auth.js';

/**
 * Main Express application setup.
 * This server acts as a proxy/wrapper for the Actual Budget API, with JWT-based auth and OAuth2 server for n8n integration.
 * Routes: Auth (login/refresh/OAuth server), Transactions (CRUD), Accounts (list), Health check.
 */
const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = '/app/.actual-cache';

/**
 * OAuth2 Configuration Object (for client-side auth, e.g., Google login - optional).
 * Pulled from environment variables (no mock fallbacks—set real values for your provider).
 * Example: Google, Auth0, GitHub. Adjust scopes/URLs per provider.
 * Requires OAUTH_CLIENT_ID set; otherwise, OAuth client routes disabled.
 */
const OAUTH_CONFIG = {
  clientID: process.env.OAUTH_CLIENT_ID,
  clientSecret: process.env.OAUTH_CLIENT_SECRET,
  authorizeURL: process.env.OAUTH_AUTHORIZE_URL,
  tokenURL: process.env.OAUTH_TOKEN_URL,
  callbackURL: process.env.OAUTH_CALLBACK_URL || `http://localhost:${PORT}/auth/oauth/callback`,
  scope: (process.env.OAUTH_SCOPE || 'openid profile email').split(' '), // Space-separated; adjust per provider
  userProfileURL: process.env.OAUTH_USER_PROFILE_URL,
  successRedirect: process.env.OAUTH_SUCCESS_REDIRECT || `http://localhost:${PORT}/dashboard`, // Where to redirect after successful auth (e.g., your frontend/n8n UI)
};

// Validate basic OAuth config on startup (client-side)
if (!OAUTH_CONFIG.clientID) {
  console.warn('OAUTH_CLIENT_ID not set; OAuth client routes disabled. Use local /auth/login for testing.');
} else {
  console.log('OAuth2 client configured for:', OAUTH_CONFIG.clientID.substring(0, 20) + '...');
}

/**
 * Rate limiting middleware for login endpoint to prevent brute-force attacks.
 * Config: 5 attempts per 15 minutes.
 */
const loginLimiter = rateLimit({ 
  windowMs: 15 * 60 * 1000, 
  max: 5, 
  message: { error: 'Too many login attempts. Try again later.' } 
});

// Global middleware: Sessions (dev-only; use secure/Redis in prod), JSON parsing, URL-encoded, Passport init
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 60 * 60 * 1000 } // 1h; secure: true in prod
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // For /oauth/token body parsing
app.use(passport.initialize()); // Enables Passport for OAuth flows (client-side)

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
        { expiresIn: `${ACCESS_TTL_SECONDS}s`, jwtid: newJti } // Use parsed TTL
      );
      // Store new access token's JTI (refresh remains valid for multi-use)
      const db = initAuthDB();
      db.prepare('INSERT INTO tokens (jti) VALUES (?)').run(newJti);
      console.log(`Access token refreshed for user '${decoded.username}' from IP ${req.ip}`);
      return res.json({
        access_token: accessToken,
        expires_in: ACCESS_TTL_SECONDS, // Seconds
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

// NEW: GET /login - Simple form for OAuth consent flow (server-side)
app.get('/login', (req, res) => {
  const returnTo = req.query.return_to || '/';
  const error = req.query.error ? `Error: ${req.query.error}` : '';
  res.send(`
    <!DOCTYPE html>
    <html><body>
      <h2>Login for OAuth</h2>
      ${error ? `<p style="color:red;">${error}</p>` : ''}
      <form method="POST" action="/login">
        <input name="username" placeholder="Username (admin)" value="${req.query.username || ''}" required><br>
        <input name="password" type="password" placeholder="Password" required><br>
        <input type="hidden" name="return_to" value="${returnTo}">
        <button type="submit">Login</button>
      </form>
    </body></html>
  `);
});

// NEW: POST /login - Authenticate and set session.user (for OAuth server flow)
app.post('/login', loginLimiter, async (req, res) => {
  const { username, password, return_to } = req.body;
  if (!username || !password) {
    return res.redirect(`/login?error=missing_creds&return_to=${encodeURIComponent(return_to || '/')}`);
  }
  try {
    await authenticateUser(username, password); // Throws if invalid
    const db = initAuthDB();
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    req.session.user = { id: user.id, username }; // Set session
    console.log(`Session login for '${username}'`);
    res.redirect(return_to || '/');
  } catch (error) {
    console.error(`Login failed:`, error.message);
    res.redirect(`/login?error=invalid_creds&return_to=${encodeURIComponent(return_to || '/')}`);
  }
});

// NEW: GET /oauth/authorize - Authorization endpoint (for n8n OAuth flow)
app.get('/oauth/authorize', async (req, res) => {
  const { client_id, redirect_uri, scope = 'api', state, response_type = 'code' } = req.query;
  if (response_type !== 'code') {
    return res.status(400).json({ error: 'Unsupported response_type' });
  }
  if (!client_id || !redirect_uri) {
    return res.status(400).json({ error: 'client_id and redirect_uri required' });
  }

  try {
    pruneExpiredCodes(); // Cleanup
    // Validate client exists (secret not checked here)
    const db = initAuthDB();
    const client = db.prepare('SELECT * FROM clients WHERE client_id = ?').get(client_id);
    if (!client) {
      return res.status(400).json({ error: 'Invalid client_id' });
    }
    if (!client.redirect_uris.split(',').includes(redirect_uri)) { // Comma-separated check
      return res.status(400).json({ error: 'Invalid redirect_uri' });
    }

    // Check session user (logged in?)
    if (!req.session.user) {
      const params = new URLSearchParams({ ...req.query, return_to: `/oauth/authorize?${new URLSearchParams(req.query)}` });
      return res.redirect(`/login?${params}`);
    }

    // Auto-approve for dev (in prod: show consent form with scopes)
    const code = generateAuthCode(client_id, req.session.user.id, redirect_uri, scope);
    const redirectUrl = `${redirect_uri}?code=${code}${state ? `&state=${state}` : ''}`;
    console.log(`OAuth authorize: Issued code ${code} for user ${req.session.user.username}, client ${client_id}`);
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Authorize failed:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// NEW: POST /oauth/token - Token endpoint (Authorization Code Grant for n8n)
app.post('/oauth/token', async (req, res) => {
  const { grant_type, code, client_id, client_secret, redirect_uri } = req.body;
  if (grant_type !== 'authorization_code') {
    return res.status(400).json({ error: 'Unsupported grant_type', error_description: 'Only authorization_code supported' });
  }
  if (!code || !client_id || !client_secret || !redirect_uri) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    pruneExpiredCodes(); // Cleanup
    validateClient(client_id, client_secret);
    const { userId, scope } = validateAuthCode(code, client_id, redirect_uri);
    const db = initAuthDB();
    const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
    if (!user) throw new Error('User not found');
    const tokens = await issueTokensFromOAuth(userId, user.username, scope);

    // Log success
    console.log(`OAuth token issued for client '${client_id}', user '${user.username}' (scope: ${scope})`);

    res.json(tokens);
  } catch (error) {
    console.error('Token exchange failed:', error.message);
    res.status(400).json({ error: 'invalid_request', error_description: error.message });
  }
});

// COMMENTED: Client-side OAuth Setup (uncomment if needed for app users logging in via external providers like Google)
// if (OAUTH_CONFIG.clientID) {
//   passport.use('oauth2', new OAuth2Strategy(
//     {
//       clientID: OAUTH_CONFIG.clientID,
//       clientSecret: OAUTH_CONFIG.clientSecret,
//       authorizationURL: OAUTH_CONFIG.authorizeURL,
//       tokenURL: OAUTH_CONFIG.tokenURL,
//       callbackURL: OAUTH_CONFIG.callbackURL,
//       scope: OAUTH_CONFIG.scope,
//     },
//     async (accessToken, refreshToken, profile, done) => {
//       try {
//         // Fetch detailed user profile...
//         const profileResponse = await fetch(OAUTH_CONFIG.userProfileURL, {
//           headers: { Authorization: `Bearer ${accessToken}` }
//         });
//         if (!profileResponse.ok) {
//           throw new Error(`Profile fetch failed: ${profileResponse.status}`);
//         }
//         const userProfile = await profileResponse.json();
//         // Derive username...
//         const username = userProfile.email || userProfile.sub || `oauth_${userProfile.id || userProfile.user_id}`;
//         const db = initAuthDB();
//         // UPSERT user...
//         const insertStmt = db.prepare(`
//           INSERT INTO users (username, password_hash, is_active, oauth_provider)
//           VALUES (?, 'OAUTH', TRUE, ?)
//           ON CONFLICT(username) DO UPDATE SET 
//             is_active = TRUE, 
//             oauth_provider = excluded.oauth_provider
//         `);
//         insertStmt.run(username, 'generic');
//         // Retrieve user ID...
//         const userRow = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
//         const userId = userRow.id;
//         // Issue JWTs...
//         const jti = crypto.randomUUID();
//         const accessTokenJWT = jwt.sign(
//           { user_id: userId, username, iss: 'actual-wrapper', aud: 'n8n' },
//           process.env.JWT_SECRET,
//           { expiresIn: `${ACCESS_TTL_SECONDS}s`, jwtid: jti }
//         );
//         const refreshTokenJWT = jwt.sign(
//           { user_id: userId, username, iss: 'actual-wrapper', aud: 'n8n' },
//           process.env.JWT_REFRESH_SECRET,
//           { expiresIn: process.env.JWT_REFRESH_TTL || '24h', jwtid: `${jti}-refresh` }
//         );
//         // Track tokens...
//         db.prepare('INSERT INTO tokens (jti) VALUES (?)').run(jti);
//         db.prepare('INSERT INTO tokens (jti) VALUES (?)').run(`${jti}-refresh`);
//         console.log(`OAuth client success: Tokens issued for user '${username}'`);
//         return done(null, { access_token: accessTokenJWT, refresh_token: refreshTokenJWT });
//       } catch (error) {
//         console.error('OAuth profile processing error:', error);
//         return done(error);
//       }
//     }
//   ));

//   // GET /auth/oauth: Start client-side OAuth flow
//   app.get('/auth/oauth', passport.authenticate('oauth2'));

//   // GET /auth/oauth/callback: Handle provider redirect
//   app.get('/auth/oauth/callback',
//     passport.authenticate('oauth2', { failureRedirect: '/auth/oauth/error' }),
//     (req, res) => {
//       const tokens = req.user;
//       const redirectUrl = `${OAUTH_CONFIG.successRedirect}?access_token=${tokens.access_token}&refresh_token=${tokens.refresh_token}`;
//       res.redirect(redirectUrl);
//     }
//   );

//   // GET /auth/oauth/error: Handle failures
//   app.get('/auth/oauth/error', (req, res) => {
//     console.error('OAuth client flow failed:', req.query.error || 'Unknown error');
//     res.status(401).json({ error: 'OAuth authentication failed. Please try again.' });
//   });

//   console.log('Real OAuth2 client integration enabled with Passport.js');
// }

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
  const res = await api.init({ 
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
 * Reports API init status, OAuth modes, and active user count.
 * No auth required for monitoring.
 */
app.get('/health', (req, res) => {
  const db = initAuthDB();
  const activeUsers = db.prepare('SELECT COUNT(*) as c FROM users WHERE is_active = 1').get().c || 0;
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    api_initialized: !!api,
    oauth_server_enabled: true, // NEW: For n8n integration
    oauth_client_enabled: !!OAUTH_CONFIG.clientID, // For external providers
    active_users: activeUsers,
    data_dir: DATA_DIR
  });
});

/**
 * Startup sequence: Ensure admin user exists, register n8n client, and generate sample token.
 * Runs async after server listen for non-blocking init.
 */
ensureAdminUserHash(); // Syncs admin hash from env (exits if no ADMIN_PW)
ensureN8nClient(); // NEW: Registers default n8n client
(async () => {
  try {
    const adminUsername = process.env.ADMIN_USER || 'admin';
    const adminPW = process.env.ADMIN_PW;
    if (adminPW) {
      const result = await authenticateUser(adminUsername, adminPW);
      console.log(`\n=== Startup Complete ===`);
      console.log(`Admin user '${adminUsername}' ready.`);
      console.log(`Admin password '${adminPW}' ready.`);
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
  console.log(`OAuth Server: GET /oauth/authorize, POST /oauth/token (for n8n)`);
  console.log(`OAuth Client: GET /auth/oauth (if enabled for external providers)`);
  console.log(`Protected: /accounts, /transactions/*`);
  console.log(`Data persistence: ${DATA_DIR}\n`);
});