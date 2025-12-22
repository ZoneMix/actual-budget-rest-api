/**
 * OAuth2 client management with secure secret hashing.
 *
 * Client secrets are hashed using bcrypt before storage.
 * This prevents secrets from being exposed if the database is compromised.
 */

import bcrypt from 'bcrypt';
import { executeQuery, getRow, pruneExpiredCodes } from '../../db/authDb.js';
import logger from '../../logging/logger.js';
import { AuthenticationError } from '../../errors/index.js';

/**
 * Hash a client secret using bcrypt.
 * Uses 12 rounds for a good balance of security and performance.
 */
const hashClientSecret = async (secret) => {
  return bcrypt.hash(secret, 12);
};

/**
 * Compare a plain text secret with a hashed secret.
 */
const compareClientSecret = async (plainSecret, hashedSecret) => {
  return bcrypt.compare(plainSecret, hashedSecret);
};

/**
 * Migrate existing plain-text secrets to hashed format.
 * This is a one-time migration for existing clients.
 */
const migrateClientSecret = async (clientId, plainSecret) => {
  const hashed = await hashClientSecret(plainSecret);
  await executeQuery(`
    UPDATE clients
    SET client_secret = ?, client_secret_hashed = TRUE
    WHERE client_id = ?
  `, [hashed, clientId]);
  logger.info(`Migrated client secret to hashed format: ${clientId}`);
};

/**
 * Validate client_id + client_secret.
 * Supports both hashed and plain-text secrets (for migration).
 */
export const validateClient = async (clientId, clientSecret) => {
  if (!clientId || !clientSecret) {
    logger.warn('OAuth2 client validation failed: missing client_id or client_secret');
    throw new AuthenticationError('Invalid client credentials');
  }

  // Validate client_id format (alphanumeric, underscore, hyphen, max 255 chars)
  const CLIENT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,255}$/;
  if (!CLIENT_ID_PATTERN.test(clientId)) {
    logger.warn(`OAuth2 client validation failed: invalid client_id format: ${clientId}`);
    throw new AuthenticationError('Invalid client credentials');
  }

  await pruneExpiredCodes();
  const client = await getRow('SELECT * FROM clients WHERE client_id = ?', [clientId]);

  if (!client) {
    logger.warn(`OAuth2 client validation failed: client_id not found: ${clientId}`);
    throw new AuthenticationError('Invalid client credentials');
  }

  // Check if secret is hashed
  // SQLite returns 1/0 for booleans, PostgreSQL returns true/false
  const isHashed = client.client_secret_hashed === true || client.client_secret_hashed === 1;
  
  if (isHashed) {
    // Compare with hashed secret
    const isValid = await compareClientSecret(clientSecret, client.client_secret);
    if (!isValid) {
      logger.warn(`OAuth2 client validation failed: invalid client_secret for client_id: ${clientId}`);
      throw new AuthenticationError('Invalid client credentials');
    }
  } else {
    // Legacy: compare plain text (and migrate to hashed)
    if (client.client_secret !== clientSecret) {
      logger.warn(`OAuth2 client validation failed: invalid client_secret for client_id: ${clientId}`);
      throw new AuthenticationError('Invalid client credentials');
    }
    // Migrate to hashed format
    await migrateClientSecret(clientId, clientSecret);
  }

  logger.debug(`OAuth2 client validation successful: ${clientId}`);
  return client;
};

/**
 * Ensure the n8n OAuth2 client exists if configured.
 * Only registers if environment variables are provided.
 * Called on startup.
 *
 * Client secrets are hashed before storage for security.
 */
export const ensureN8NClient = async () => {
  // Use dynamic import to avoid circular dependency
  const envModule = await import('../../config/env.js');
  const env = envModule.default;
  
  const clientId = env.N8N_CLIENT_ID;
  const clientSecret = env.N8N_CLIENT_SECRET;
  const callbackUrl = env.N8N_OAUTH2_CALLBACK_URL;

  // If not all OAuth2 vars are set, skip n8n OAuth2 setup
  if (!clientId || !clientSecret || !callbackUrl) {
    logger.info('n8n OAuth2 not configured (missing N8N_CLIENT_ID, N8N_CLIENT_SECRET, or N8N_OAUTH2_CALLBACK_URL). Skipping n8n client registration.');
    return false;
  }

  // Validate secret is not a default/weak value
  if (clientSecret.length < 32) {
    logger.warn('N8N_CLIENT_SECRET is too short. Use at least 32 characters for security.');
  }

  // Validate client_id format
  const CLIENT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,255}$/;
  if (!CLIENT_ID_PATTERN.test(clientId)) {
    logger.warn(`Invalid client_id format during n8n client setup: ${clientId}`);
    throw new Error('Invalid client_id format');
  }

  const existing = await getRow('SELECT client_secret_hashed FROM clients WHERE client_id = ?', [clientId]);

  // Hash the secret before storage
  const hashedSecret = await hashClientSecret(clientSecret);

  if (!existing) {
    // New client - insert with hashed secret
    await executeQuery(`
      INSERT INTO clients (client_id, client_secret, client_secret_hashed, allowed_scopes, redirect_uris)
      VALUES (?, ?, TRUE, 'api', ?)
    `, [clientId, hashedSecret, callbackUrl]);
    logger.info(`Registered n8n OAuth2 client: ${clientId} (secret hashed)`);
  } else {
    // Update secret and callback in case they changed
    // Always update to hashed format if it wasn't already
    await executeQuery(`
      UPDATE clients
      SET client_secret = ?, client_secret_hashed = TRUE, redirect_uris = ?
      WHERE client_id = ?
    `, [hashedSecret, callbackUrl, clientId]);
    logger.info(`Updated n8n OAuth2 client: ${clientId} (secret hashed)`);
  }

  return true;
};