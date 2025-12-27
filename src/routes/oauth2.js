/**
 * OAuth2 Authorization Server endpoints for n8n integration.
 *
 * Implements OAuth2 authorization code flow:
 * 1. GET /oauth/authorize - User authorizes client, receives authorization code
 * 2. POST /oauth/token - Client exchanges code for access token or refresh token for new tokens
 *
 * Supported grant types:
 * - authorization_code: Exchange authorization code for access and refresh tokens
 * - refresh_token: Exchange refresh token for new access and refresh tokens (token rotation)
 *
 * Note: This is simplified for internal n8n use - authorization is auto-approved
 * if the user is already logged in via session.
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import { validateClient } from '../auth/oauth2/client.js';
import { generateAuthCode } from '../auth/oauth2/code.js';
import { validateAuthCode } from '../auth/oauth2/code.js';
import { issueTokens, isTokenRevoked, revokeToken } from '../auth/jwt.js';
import { getRow } from '../db/authDb.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { throwBadRequest, throwInternalError, throwUnauthorized } from '../middleware/responseHelpers.js';
import logger, { logAuthEvent } from '../logging/logger.js';

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
 * OAuth2 token endpoint. Supports two grant types:
 * 1. authorization_code: Exchanges authorization code for access token
 * 2. refresh_token: Exchanges refresh token for new access and refresh tokens
 * 
 * Supports client credentials via:
 * - HTTP Basic Authentication (Authorization: Basic <base64(client_id:client_secret)>) - Recommended
 * - Request body (client_id, client_secret) - form-encoded or JSON
 */
router.post('/token', express.json(), express.urlencoded({ extended: true }), asyncHandler(async (req, res) => {
  const { grant_type, code, redirect_uri, refresh_token } = req.body;

  logger.debug('[OAuth2] Token exchange request', { 
    grant_type,
    hasCode: !!code,
    hasRefreshToken: !!refresh_token,
    redirect_uri,
    hasBasicAuth: !!req.headers.authorization?.startsWith('Basic ')
  });

  // Support authorization_code and refresh_token grants
  if (grant_type !== 'authorization_code' && grant_type !== 'refresh_token') {
    logger.warn('[OAuth2] Unsupported grant_type', { grant_type });
    throwBadRequest('Unsupported grant_type');
  }

  // Extract client credentials (supports Basic Auth or body)
  // Note: OAuth2 spec allows optional client credentials for refresh_token grant,
  // but we require them for security
  const credentials = extractClientCredentials(req);
  if (!credentials) {
    logger.warn('[OAuth2] Missing client credentials');
    throwBadRequest('Client credentials required. Provide via Basic Auth header or request body (client_id, client_secret)');
  }

  const { clientId, clientSecret } = credentials;

  // Validate client credentials
  await validateClient(clientId, clientSecret);

  // Handle refresh_token grant type
  if (grant_type === 'refresh_token') {
    if (!refresh_token) {
      logger.warn('[OAuth2] Missing refresh_token');
      throwBadRequest('refresh_token is required for refresh_token grant type');
    }

    try {
      // Verify and decode the refresh token
      const decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
      
      // Check if token was revoked
      if (await isTokenRevoked(decoded.jti)) {
        logAuthEvent('REFRESH_FAILED', decoded.user_id, { reason: 'token_revoked', clientId }, false);
        throwUnauthorized('Refresh token revoked');
      }

      // Get user's current role and scopes from database
      const user = await getRow('SELECT username, role, scopes FROM users WHERE id = ?', [decoded.user_id]);
      if (!user) {
        logger.error('[OAuth2] User not found for refresh token', { userId: decoded.user_id, clientId });
        throwInternalError('User not found');
      }

      const role = user.role || decoded.role || 'user';
      const scopes = user.scopes || decoded.scope || 'api';

      // Issue new tokens (both access and refresh for token rotation)
      const tokens = await issueTokens(decoded.user_id, user.username, scopes, role);
      
      // Revoke the old refresh token for proper token rotation security
      await revokeToken(decoded.jti);
      
      logAuthEvent('TOKEN_REFRESHED', decoded.user_id, { 
        username: user.username, 
        role, 
        clientId 
      }, true);

      logger.info('[OAuth2] Tokens issued via refresh_token', { 
        clientId, 
        userId: decoded.user_id, 
        username: user.username,
        scope: scopes 
      });
      
      return res.json(tokens);
    } catch (err) {
      // Re-throw HTTP errors (like throwUnauthorized above)
      if (err.status) throw err;
      
      // Handle JWT verification errors
      logAuthEvent('REFRESH_FAILED', null, { 
        reason: 'invalid_token', 
        error: err.message, 
        clientId 
      }, false);
      throwUnauthorized('Invalid or expired refresh token');
    }
  }

  // Handle authorization_code grant type (existing logic)
  if (grant_type === 'authorization_code') {
    if (!code || !redirect_uri) {
      logger.warn('[OAuth2] Missing code or redirect_uri for authorization_code grant');
      throwBadRequest('code and redirect_uri are required for authorization_code grant type');
    }

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
    
    return res.json(tokens);
  }
}));

export default router;