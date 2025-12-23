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
import { getRow } from '../db/authDb.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { throwBadRequest, throwInternalError } from '../middleware/responseHelpers.js';
import logger from '../logging/logger.js';

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

  logger.debug('[OAuth2] Authorization request', { 
    client_id, 
    redirect_uri, 
    scope, 
    response_type,
    hasSession: !!req.session.user,
    userId: req.session.user?.id
  });

  // Validate OAuth2 parameters
  if (response_type !== 'code') {
    logger.warn('[OAuth2] Unsupported response_type', { response_type, client_id });
    throwBadRequest('Unsupported response_type');
  }

  if (!client_id || !redirect_uri) {
    logger.warn('[OAuth2] Missing parameters', { hasClientId: !!client_id, hasRedirectUri: !!redirect_uri });
    throwBadRequest('Missing parameters');
  }

  // Validate client_id format (alphanumeric, underscore, hyphen, max 255 chars)
  const CLIENT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,255}$/;
  if (!CLIENT_ID_PATTERN.test(client_id)) {
    logger.warn('[OAuth2] Invalid client_id format', { client_id });
    throwBadRequest('Invalid client_id format');
  }

  // Verify client exists
  const client = await getRow('SELECT * FROM clients WHERE client_id = ?', [client_id]);
  if (!client) {
    logger.warn('[OAuth2] Client not found', { client_id });
    throwBadRequest('Invalid client_id');
  }

  // Verify redirect URI is allowed for this client
  if (!client.redirect_uris) {
    logger.warn('[OAuth2] Client has no redirect URIs', { client_id });
    throwBadRequest('Client has no configured redirect URIs');
  }
  const allowedUris = client.redirect_uris.split(',').map(uri => uri.trim()).filter(Boolean);
  if (!allowedUris.includes(redirect_uri)) {
    logger.warn('[OAuth2] Invalid redirect_uri', { client_id, redirect_uri, allowedUris });
    throwBadRequest('Invalid redirect_uri');
  }

  // Require user to be logged in via session
  if (!req.session.user) {
    logger.debug('[OAuth2] User not logged in, redirecting to login', { client_id });
    const params = new URLSearchParams({ ...req.query, return_to: req.originalUrl });
    return res.redirect(`/login?${params}`);
  }

  // Auto-approve and generate authorization code (simplified for internal use)
  // Store state in session for CSRF protection
  if (state) {
    req.session.oauth2_state = state;
  }
  
  const code = await generateAuthCode(client_id, req.session.user.id, redirect_uri, scope);
  
  logger.info('[OAuth2] Authorization code generated', { 
    client_id, 
    userId: req.session.user.id,
    redirect_uri,
    scope,
    hasState: !!state
  });
  
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

  logger.debug('[OAuth2] Token exchange request', { 
    grant_type,
    hasCode: !!code,
    redirect_uri,
    hasBasicAuth: !!req.headers.authorization?.startsWith('Basic ')
  });

  // Only support authorization code grant
  if (grant_type !== 'authorization_code') {
    logger.warn('[OAuth2] Unsupported grant_type', { grant_type });
    throwBadRequest('Unsupported grant_type');
  }

  // Extract client credentials (supports Basic Auth or body)
  const credentials = extractClientCredentials(req);
  if (!credentials) {
    logger.warn('[OAuth2] Missing client credentials');
    throwBadRequest('Client credentials required. Provide via Basic Auth header or request body (client_id, client_secret)');
  }

  const { clientId, clientSecret } = credentials;

  // Validate client credentials
  await validateClient(clientId, clientSecret);
  
  // Validate and exchange authorization code
  const { userId, scope } = await validateAuthCode(code, clientId, redirect_uri);

  logger.debug('[OAuth2] Authorization code validated', { clientId, userId, scope });

  // Get user details for token issuance
  const user = await getRow('SELECT username FROM users WHERE id = ?', [userId]);
  if (!user) {
    logger.error('[OAuth2] User not found after code validation', { userId, clientId });
    throwInternalError('User not found');
  }

  // Issue JWT tokens
  const tokens = await issueTokens(userId, user.username, scope);
  
  logger.info('[OAuth2] Tokens issued via authorization code', { 
    clientId, 
    userId, 
    username: user.username,
    scope 
  });
  
  res.json(tokens);
}));

export default router;