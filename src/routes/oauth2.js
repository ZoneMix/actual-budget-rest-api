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
 *
 * Scope handling lives in ../auth/oauth2/scopes.js and the grants themselves in
 * ../auth/oauth2/grants.js; this file is routing, validation and redirects.
 */

import express from 'express';
import { validateClient } from '../auth/oauth2/client.js';
import { generateAuthCode } from '../auth/oauth2/code.js';
import { exchangeAuthorizationCode, exchangeRefreshToken } from '../auth/oauth2/grants.js';
import {
  clientAllowedScopes,
  disallowedScopes,
  formatScopes,
  intersectScopes,
  parseRequestedScopes,
  clientDefaultScopes,
  userHeldScopes,
} from '../auth/oauth2/scopes.js';
import { getRow } from '../db/authDb.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { throwBadRequest } from '../middleware/responseHelpers.js';
import logger from '../logging/logger.js';
import { standardBodyParser, standardUrlParser } from '../middleware/bodyParser.js';

const router = express.Router();

// Alphanumeric, underscore, hyphen, max 255 chars.
const CLIENT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,255}$/;

/** Build a redirect back to the client, preserving `state` when given. */
const redirectTo = (res, redirectUri, params, state) => {
  const redirectUrl = new URL(redirectUri);
  Object.entries(params).forEach(([key, value]) => redirectUrl.searchParams.set(key, value));
  if (state) {
    redirectUrl.searchParams.set('state', state);
  }
  return res.redirect(redirectUrl.toString());
};

/** Load the client and confirm the redirect_uri is one it registered. */
const resolveAuthorizeClient = async (clientId, redirectUri) => {
  if (!CLIENT_ID_PATTERN.test(clientId)) {
    logger.warn('[OAuth2] Invalid client_id format', { client_id: clientId });
    throwBadRequest('Invalid client_id format');
  }

  const client = await getRow('SELECT * FROM clients WHERE client_id = ?', [clientId]);
  if (!client) {
    logger.warn('[OAuth2] Client not found', { client_id: clientId });
    throwBadRequest('Invalid client_id');
  }

  if (!client.redirect_uris) {
    logger.warn('[OAuth2] Client has no redirect URIs', { client_id: clientId });
    throwBadRequest('Client has no configured redirect URIs');
  }

  const allowedUris = client.redirect_uris.split(',').map((uri) => uri.trim()).filter(Boolean);
  if (!allowedUris.includes(redirectUri)) {
    logger.warn('[OAuth2] Invalid redirect_uri', { client_id: clientId, redirect_uri: redirectUri, allowedUris });
    throwBadRequest('Invalid redirect_uri');
  }

  return client;
};

/**
 * Narrow a request to what the signed-in user's own row holds. A scope the user
 * does not hold is dropped rather than refused (RFC 6749 §3.3 allows a narrower
 * grant than requested); the caller refuses only an empty result.
 */
const narrowToSessionUser = async (userId, requested) => {
  const user = await getRow('SELECT scopes FROM users WHERE id = ?', [userId]);
  return intersectScopes(requested, userHeldScopes(user));
};

/**
 * GET /oauth/authorize
 *
 * OAuth2 authorization endpoint. Validates client, redirect URI and requested
 * scope, then generates and returns an authorization code.
 *
 * If user is not logged in via session, redirects to login page.
 * Otherwise, auto-approves and redirects back with authorization code.
 */
router.get('/authorize', asyncHandler(async (req, res) => {
  const { client_id, redirect_uri, scope, state, response_type = 'code' } = req.query;

  logger.debug('[OAuth2] Authorization request', {
    client_id,
    redirect_uri,
    scope,
    response_type,
    hasSession: !!req.session.user,
    userId: req.session.user?.id,
  });

  if (response_type !== 'code') {
    logger.warn('[OAuth2] Unsupported response_type', { response_type, client_id });
    throwBadRequest('Unsupported response_type');
  }

  if (!client_id || !redirect_uri) {
    logger.warn('[OAuth2] Missing parameters', { hasClientId: !!client_id, hasRedirectUri: !!redirect_uri });
    throwBadRequest('Missing parameters');
  }

  const client = await resolveAuthorizeClient(client_id, redirect_uri);

  // Require user to be logged in via session. Every scope decision below comes
  // after this on purpose: answering invalid_scope to an anonymous caller would
  // let anyone enumerate any client's allowed_scopes one request at a time.
  if (!req.session.user) {
    logger.debug('[OAuth2] User not logged in, redirecting to login', { client_id });
    const params = new URLSearchParams({ ...req.query, return_to: req.originalUrl });
    return res.redirect(`/login?${params}`);
  }

  // A scope the client may not grant is refused outright (RFC 6749 §4.1.2.1).
  // With no `scope` in the query the client's own registration is the default
  // (RFC 6749 §3.3); a global default it may not hold would be refused below.
  const requested = parseRequestedScopes(scope, clientDefaultScopes(client));
  const refused = disallowedScopes(requested, clientAllowedScopes(client));
  if (refused.length > 0) {
    logger.warn('[OAuth2] Requested scope not allowed for client', {
      client_id,
      requested,
      allowed_scopes: client.allowed_scopes,
      refused,
    });
    return redirectTo(res, redirect_uri, {
      error: 'invalid_scope',
      error_description: `Client is not allowed the requested scope(s): ${refused.join(' ')}`,
    }, state);
  }

  // A client may be registered for more than the person signing in holds; the
  // grant is bounded by both. Only an empty result is an error.
  const granted = await narrowToSessionUser(req.session.user.id, requested);
  if (granted.length === 0) {
    logger.warn('[OAuth2] Requested scope not held by the authorizing user', {
      client_id,
      userId: req.session.user.id,
      requested,
    });
    return redirectTo(res, redirect_uri, {
      error: 'invalid_scope',
      error_description: `The signed-in user does not hold the requested scope(s): ${requested.join(' ')}`,
    }, state);
  }

  // Auto-approve (simplified for internal use) and store state for CSRF protection
  if (state) {
    req.session.oauth2_state = state;
  }

  const grantedScopes = formatScopes(granted);
  const code = await generateAuthCode(client_id, req.session.user.id, redirect_uri, grantedScopes);

  logger.info('[OAuth2] Authorization code generated', {
    client_id,
    userId: req.session.user.id,
    redirect_uri,
    scope: grantedScopes,
    hasState: !!state,
  });

  return redirectTo(res, redirect_uri, { code }, state);
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
router.post('/token', standardBodyParser, standardUrlParser, asyncHandler(async (req, res) => {
  const { grant_type, code, redirect_uri, refresh_token } = req.body;

  logger.debug('[OAuth2] Token exchange request', {
    grant_type,
    hasCode: !!code,
    hasRefreshToken: !!refresh_token,
    redirect_uri,
    hasBasicAuth: !!req.headers.authorization?.startsWith('Basic '),
  });

  if (grant_type !== 'authorization_code' && grant_type !== 'refresh_token') {
    logger.warn('[OAuth2] Unsupported grant_type', { grant_type });
    throwBadRequest('Unsupported grant_type');
  }

  // Client credentials are optional for the refresh grant per spec; required here.
  const credentials = extractClientCredentials(req);
  if (!credentials) {
    logger.warn('[OAuth2] Missing client credentials');
    throwBadRequest('Client credentials required. Provide via Basic Auth header or request body (client_id, client_secret)');
  }

  const { clientId, clientSecret } = credentials;
  const client = await validateClient(clientId, clientSecret);

  if (grant_type === 'refresh_token') {
    if (!refresh_token) {
      logger.warn('[OAuth2] Missing refresh_token');
      throwBadRequest('refresh_token is required for refresh_token grant type');
    }
    const tokens = await exchangeRefreshToken({ client, clientId, refreshToken: refresh_token });
    return res.json(tokens);
  }

  if (!code || !redirect_uri) {
    logger.warn('[OAuth2] Missing code or redirect_uri for authorization_code grant');
    throwBadRequest('code and redirect_uri are required for authorization_code grant type');
  }

  const tokens = await exchangeAuthorizationCode({ client, clientId, code, redirectUri: redirect_uri });
  return res.json(tokens);
}));

export default router;
