/**
 * OAuth2 client management.
 */

import { getDb, pruneExpiredCodes } from '../../db/authDb.js';

/**
 * Validate client_id + client_secret.
 */
export const validateClient = (clientId, clientSecret) => {
  pruneExpiredCodes();
  const db = getDb();
  const client = db.prepare('SELECT * FROM clients WHERE client_id = ?').get(clientId);

  if (!client || client.client_secret !== clientSecret) {
    throw new Error('Invalid client credentials');
  }
  return client;
};

/**
 * Ensure the default n8n client exists (called on startup).
 */
export const ensureN8NClient = () => {
  const db = getDb();
  const clientId = process.env.N8N_CLIENT_ID || 'n8n';
  const clientSecret = process.env.N8N_CLIENT_SECRET || 'n8n_secret';

  const existing = db.prepare('SELECT 1 FROM clients WHERE client_id = ?').get(clientId);
  if (!existing) {
    db.prepare(`
      INSERT INTO clients (client_id, client_secret, allowed_scopes, redirect_uris)
      VALUES (?, ?, 'api', 'http://localhost:5678/rest/oauth2-credential/callback')
    `).run(clientId, clientSecret);
    console.log(`Registered default n8n OAuth2 client: ${clientId}`);
  }
};