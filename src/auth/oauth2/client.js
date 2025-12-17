/**
 * OAuth2 client management.
 */

import { getDb, pruneExpiredCodes } from '../../db/authDb.js';
import logger from '../../logging/logger.js';

/**
 * Validate client_id + client_secret.
 */
export const validateClient = async (clientId, clientSecret) => {
  pruneExpiredCodes();
  const db = getDb();
  const client = db.prepare('SELECT * FROM clients WHERE client_id = ?').get(clientId);

  if (!client) {
    throw new Error('Invalid client credentials');
  }

  // Compare hashed client secret (if using hashed secrets)
  // For now, direct comparison, but consider hashing in production
  if (client.client_secret !== clientSecret) {
    throw new Error('Invalid client credentials');
  }

  return client;
};

/**
 * Ensure the n8n OAuth2 client exists if configured.
 * Only registers if environment variables are provided.
 * Called on startup.
 */
export const ensureN8NClient = async () => {
  const clientId = process.env.N8N_CLIENT_ID;
  const clientSecret = process.env.N8N_CLIENT_SECRET;
  const callbackUrl = process.env.N8N_OAUTH2_CALLBACK_URL;

  // If not all OAuth2 vars are set, skip n8n OAuth2 setup
  if (!clientId || !clientSecret || !callbackUrl) {
    logger.info('n8n OAuth2 not configured (missing N8N_CLIENT_ID, N8N_CLIENT_SECRET, or N8N_OAUTH2_CALLBACK_URL). Skipping n8n client registration.');
    return false;
  }

  // Validate secret is not a default/weak value
  if (clientSecret.length < 32) {
    logger.warn('N8N_CLIENT_SECRET is too short. Use at least 32 characters for security.');
  }

  const db = getDb();
  const existing = db.prepare('SELECT 1 FROM clients WHERE client_id = ?').get(clientId);

  if (!existing) {
    db.prepare(`
      INSERT INTO clients (client_id, client_secret, allowed_scopes, redirect_uris)
      VALUES (?, ?, 'api', ?)
    `).run(clientId, clientSecret, callbackUrl);
    logger.info(`Registered n8n OAuth2 client: ${clientId}`);
  } else {
    // Update secret and callback in case they changed
    db.prepare(`
      UPDATE clients
      SET client_secret = ?, redirect_uris = ?
      WHERE client_id = ?
    `).run(clientSecret, callbackUrl, clientId);
    logger.info(`Updated n8n OAuth2 client: ${clientId}`);
  }

  return true;
};