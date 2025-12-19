/**
 * OAuth2 Authorization Server endpoints for n8n integration.
 *
 * Implements OAuth2 authorization code flow:
 * 1. GET /oauth/authorize - User authorizes client, receives authorization code
 * 2. POST /oauth/token - Client exchanges code for access token
 *
 * Note: This is simplified for internal n8n use - authorization is auto-approved
 * if the user is already logged in via session.
 */

import express from 'express';
import { validateClient } from '../auth/oauth2/client.js';
import { generateAuthCode } from '../auth/oauth2/code.js';
import { validateAuthCode } from '../auth/oauth2/code.js';
import { issueTokens } from '../auth/jwt.js';
import { getDb } from '../db/authDb.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { throwBadRequest, throwInternalError } from '../middleware/responseHelpers.js';

const router = express.Router();

/**
 * GET /oauth/authorize
 *
 * OAuth2 authorization endpoint. Validates client and redirect URI,
 * then generates and returns an authorization code.
 *
 * If user is not logged in via session, redirects to login page.
 * Otherwise, auto-approves and redirects back with authorization code.
 */
router.get('/authorize', asyncHandler(async (req, res) => {
  const { client_id, redirect_uri, scope = 'api', state, response_type = 'code' } = req.query;

  // Validate OAuth2 parameters
  if (response_type !== 'code') {
    throwBadRequest('Unsupported response_type');
  }

  if (!client_id || !redirect_uri) {
    throwBadRequest('Missing parameters');
  }

  // Verify client exists
  const db = getDb();
  const client = db.prepare('SELECT * FROM clients WHERE client_id = ?').get(client_id);
  if (!client) {
    throwBadRequest('Invalid client_id');
  }

  // Verify redirect URI is allowed for this client
  if (!client.redirect_uris) {
    throwBadRequest('Client has no configured redirect URIs');
  }
  const allowedUris = client.redirect_uris.split(',').map(uri => uri.trim()).filter(Boolean);
  if (!allowedUris.includes(redirect_uri)) {
    throwBadRequest('Invalid redirect_uri');
  }

  // Require user to be logged in via session
  if (!req.session.user) {
    const params = new URLSearchParams({ ...req.query, return_to: req.originalUrl });
    return res.redirect(`/login?${params}`);
  }

  // Auto-approve and generate authorization code (simplified for internal use)
  // Store state in session for CSRF protection
  if (state) {
    req.session.oauth2_state = state;
  }
  
  const code = generateAuthCode(client_id, req.session.user.id, redirect_uri, scope);
  
  // Build redirect URL with state parameter
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set('code', code);
  if (state) {
    redirectUrl.searchParams.set('state', state);
  }
  
  res.redirect(redirectUrl.toString());
}));

/**
 * Extract client credentials from request.
 * Supports both:
 * 1. HTTP Basic Authentication (Authorization header) - OAuth2 recommended
 * 2. Request body parameters (client_id, client_secret)
 */
const extractClientCredentials = (req) => {
  // Method 1: Try Basic Auth header first (OAuth2 recommended)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Basic ')) {
    try {
      const base64Credentials = authHeader.slice(6); // Remove 'Basic ' prefix
      const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
      const [clientId, clientSecret] = credentials.split(':', 2);
      
      if (clientId && clientSecret) {
        return { clientId, clientSecret };
      }
    } catch {
      // Invalid Basic Auth format, fall through to body method
    }
  }
  
  // Method 2: Fall back to request body
  const { client_id, client_secret } = req.body;
  if (client_id && client_secret) {
    return { clientId: client_id, clientSecret: client_secret };
  }
  
  return null;
};

/**
 * POST /oauth/token
 *
 * OAuth2 token endpoint. Exchanges authorization code for access token.
 * Validates client credentials and authorization code before issuing tokens.
 * 
 * Supports client credentials via:
 * - HTTP Basic Authentication (Authorization: Basic <base64(client_id:client_secret)>) - Recommended
 * - Request body (client_id, client_secret) - form-encoded or JSON
 */
router.post('/token', express.json(), express.urlencoded({ extended: true }), asyncHandler(async (req, res) => {
  const { grant_type, code, redirect_uri } = req.body;

  // Only support authorization code grant
  if (grant_type !== 'authorization_code') {
    throwBadRequest('Unsupported grant_type');
  }

  // Extract client credentials (supports Basic Auth or body)
  const credentials = extractClientCredentials(req);
  if (!credentials) {
    throwBadRequest('Client credentials required. Provide via Basic Auth header or request body (client_id, client_secret)');
  }

  const { clientId, clientSecret } = credentials;

  // Validate client credentials
  await validateClient(clientId, clientSecret);
  
  // Validate and exchange authorization code
  const { userId, scope } = validateAuthCode(code, clientId, redirect_uri);

  // Get user details for token issuance
  const db = getDb();
  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
  if (!user) {
    throwInternalError('User not found');
  }

  // Issue JWT tokens
  const tokens = issueTokens(userId, user.username, scope);
  res.json(tokens);
}));

export default router;