/**
 * Admin API routes for OAuth client management.
 * 
 * All endpoints require admin authentication (JWT or session) and are rate limited.
 */

import express from 'express';
import { authenticateAdminAPI } from '../auth/adminApi.js';
import { listClients, getClient, createClient, updateClient, deleteClient } from '../auth/oauth2/client.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { sendSuccess, sendCreated, throwBadRequest, throwNotFound } from '../middleware/responseHelpers.js';
import { validateBody, validateParams, CreateClientSchema, UpdateClientSchema, ClientIdParamsSchema } from '../middleware/validation-schemas.js';
import { adminLimiter, standardWriteLimiter, deleteLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

// All admin routes require authentication (JWT or session) and rate limiting
router.use(asyncHandler(authenticateAdminAPI));
router.use(adminLimiter);

/**
 * GET /admin/oauth-clients
 * 
 * List all OAuth clients (without secrets).
 */
router.get('/oauth-clients', asyncHandler(async (req, res) => {
  const clients = await listClients();
  sendSuccess(res, { clients });
}));

/**
 * GET /admin/oauth-clients/:clientId
 * 
 * Get a specific OAuth client (without secret).
 */
router.get('/oauth-clients/:clientId', validateParams(ClientIdParamsSchema), asyncHandler(async (req, res) => {
  const { clientId } = req.validatedParams;
  const client = await getClient(clientId);
  
  if (!client) {
    throwNotFound(`OAuth client '${clientId}' not found`);
  }
  
  sendSuccess(res, { client });
}));

/**
 * POST /admin/oauth-clients
 * 
 * Create a new OAuth client.
 * Generates a secure secret automatically if not provided.
 * Returns the client with the plain secret (only time it's available).
 */
router.post('/oauth-clients', standardWriteLimiter, validateBody(CreateClientSchema), asyncHandler(async (req, res) => {
  const { client_id, client_secret, allowed_scopes, redirect_uris } = req.validatedBody;
  
  try {
    const client = await createClient({
      clientId: client_id,
      clientSecret: client_secret,
      allowedScopes: allowed_scopes,
      redirectUris: redirect_uris,
    });
    
    sendCreated(res, {
      client,
      message: 'OAuth client created successfully. Save the client_secret now - it will not be shown again.',
    });
  } catch (error) {
    if (error.message.includes('already exists')) {
      throwBadRequest(error.message);
    }
    throw error;
  }
}));

/**
 * PUT /admin/oauth-clients/:clientId
 * 
 * Update an existing OAuth client.
 * If client_secret is provided, it will be hashed and stored.
 */
router.put('/oauth-clients/:clientId', 
  standardWriteLimiter,
  validateParams(ClientIdParamsSchema),
  validateBody(UpdateClientSchema),
  asyncHandler(async (req, res) => {
    const { clientId } = req.validatedParams;
    const updates = req.validatedBody;
    
    try {
      const client = await updateClient(clientId, updates);
      sendSuccess(res, {
        client,
        message: 'OAuth client updated successfully',
      });
    } catch (error) {
      if (error.message.includes('not found')) {
        throwNotFound(error.message);
      }
      throw error;
    }
  })
);

/**
 * DELETE /admin/oauth-clients/:clientId
 * 
 * Delete an OAuth client.
 */
router.delete('/oauth-clients/:clientId', deleteLimiter, validateParams(ClientIdParamsSchema), asyncHandler(async (req, res) => {
  const { clientId } = req.validatedParams;
  const deleted = await deleteClient(clientId);
  
  if (!deleted) {
    throwNotFound(`OAuth client '${clientId}' not found`);
  }
  
  sendSuccess(res, { message: `OAuth client '${clientId}' deleted successfully` });
}));

export default router;

