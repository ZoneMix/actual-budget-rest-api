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
import logger from '../logging/logger.js';

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
  logger.debug('[Admin] Listing OAuth clients', { userId: req.user?.user_id });
  const clients = await listClients();
  logger.info('[Admin] OAuth clients listed', { userId: req.user?.user_id, count: clients.length });
  sendSuccess(res, { clients });
}));

/**
 * GET /admin/oauth-clients/:clientId
 * 
 * Get a specific OAuth client (without secret).
 */
router.get('/oauth-clients/:clientId', validateParams(ClientIdParamsSchema), asyncHandler(async (req, res) => {
  const { clientId } = req.validatedParams;
  logger.debug('[Admin] Getting OAuth client', { userId: req.user?.user_id, clientId });
  const client = await getClient(clientId);
  
  if (!client) {
    logger.warn('[Admin] OAuth client not found', { userId: req.user?.user_id, clientId });
    throwNotFound(`OAuth client '${clientId}' not found`);
  }
  
  logger.info('[Admin] OAuth client retrieved', { userId: req.user?.user_id, clientId });
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
  
  logger.debug('[Admin] Creating OAuth client', { 
    userId: req.user?.user_id, 
    client_id,
    hasSecret: !!client_secret,
    allowed_scopes,
    redirect_uris: redirect_uris ? (Array.isArray(redirect_uris) ? redirect_uris.length : 1) : 0
  });
  
  try {
    const client = await createClient({
      clientId: client_id,
      clientSecret: client_secret,
      allowedScopes: allowed_scopes,
      redirectUris: redirect_uris,
    });
    
    logger.info('[Admin] OAuth client created', { 
      userId: req.user?.user_id, 
      client_id,
      allowed_scopes: client.allowed_scopes 
    });
    
    sendCreated(res, {
      client,
      message: 'OAuth client created successfully. Save the client_secret now - it will not be shown again.',
    });
  } catch (error) {
    if (error.message.includes('already exists')) {
      logger.warn('[Admin] OAuth client creation failed - already exists', { 
        userId: req.user?.user_id, 
        client_id 
      });
      throwBadRequest(error.message);
    }
    logger.error('[Admin] OAuth client creation failed', { 
      userId: req.user?.user_id, 
      client_id, 
      error: error.message 
    });
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
    
    logger.debug('[Admin] Updating OAuth client', { 
      userId: req.user?.user_id, 
      clientId,
      updateFields: Object.keys(updates.fields || {})
    });
    
    try {
      const client = await updateClient(clientId, updates);
      logger.info('[Admin] OAuth client updated', { 
        userId: req.user?.user_id, 
        clientId 
      });
      sendSuccess(res, {
        client,
        message: 'OAuth client updated successfully',
      });
    } catch (error) {
      if (error.message.includes('not found')) {
        logger.warn('[Admin] OAuth client update failed - not found', { 
          userId: req.user?.user_id, 
          clientId 
        });
        throwNotFound(error.message);
      }
      logger.error('[Admin] OAuth client update failed', { 
        userId: req.user?.user_id, 
        clientId, 
        error: error.message 
      });
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
  
  logger.debug('[Admin] Deleting OAuth client', { 
    userId: req.user?.user_id, 
    clientId 
  });
  
  const deleted = await deleteClient(clientId);
  
  if (!deleted) {
    logger.warn('[Admin] OAuth client deletion failed - not found', { 
      userId: req.user?.user_id, 
      clientId 
    });
    throwNotFound(`OAuth client '${clientId}' not found`);
  }
  
  logger.info('[Admin] OAuth client deleted', { 
    userId: req.user?.user_id, 
    clientId 
  });
  
  sendSuccess(res, { message: `OAuth client '${clientId}' deleted successfully` });
}));

export default router;

