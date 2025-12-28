/**
 * OAuth2 client management with secure secret hashing.
 *
 * Client secrets are hashed using bcrypt before storage.
 * This prevents secrets from being exposed if the database is compromised.
 */

import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { executeQuery, getRow, getAllRows, pruneExpiredCodes } from '../../db/authDb.js';
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
 * Generate a secure random client secret.
 * Returns a base64-encoded random string of 32 bytes (44 characters).
 */
export const generateClientSecret = () => {
  return crypto.randomBytes(32).toString('base64');
};

/**
 * Get all OAuth clients (without secrets).
 * Returns safe client information for listing.
 */
export const listClients = async () => {
  const clients = await getAllRows(`
    SELECT 
      client_id,
      allowed_scopes,
      redirect_uris,
      created_at
    FROM clients
    ORDER BY created_at DESC
  `);
  
  return clients || [];
};

/**
 * Get a single OAuth client by ID (without secret).
 * Returns safe client information.
 */
export const getClient = async (clientId) => {
  const client = await getRow(`
    SELECT 
      client_id,
      allowed_scopes,
      redirect_uris,
      created_at
    FROM clients
    WHERE client_id = ?
  `, [clientId]);
  
  return client || null;
};

/**
 * Create a new OAuth client.
 * Generates a secure secret automatically if not provided.
 * 
 * @param {Object} options - Client creation options
 * @param {string} options.clientId - Client identifier (required)
 * @param {string} [options.clientSecret] - Client secret (auto-generated if not provided)
 * @param {string} [options.allowedScopes] - Allowed scopes (default: 'api')
 * @param {string|string[]} [options.redirectUris] - Redirect URIs (comma-separated string or array)
 * @returns {Object} Created client with plain secret (only returned once)
 */
export const createClient = async ({ clientId, clientSecret, allowedScopes = 'api', redirectUris = '' }) => {
  if (!clientId) {
    throw new Error('clientId is required');
  }

  // Check if client already exists
  const existing = await getRow('SELECT client_id FROM clients WHERE client_id = ?', [clientId]);
  if (existing) {
    throw new Error(`Client with ID '${clientId}' already exists`);
  }

  // Generate secret if not provided
  const plainSecret = clientSecret || generateClientSecret();
  
  // Validate secret length
  if (plainSecret.length < 32) {
    throw new Error('Client secret must be at least 32 characters long');
  }

  // Normalize redirect URIs
  const redirectUrisStr = Array.isArray(redirectUris) 
    ? redirectUris.join(',') 
    : redirectUris;

  // Hash the secret before storage
  const hashedSecret = await hashClientSecret(plainSecret);

  // Insert client
  await executeQuery(`
    INSERT INTO clients (client_id, client_secret, client_secret_hashed, allowed_scopes, redirect_uris)
    VALUES (?, ?, TRUE, ?, ?)
  `, [clientId, hashedSecret, allowedScopes, redirectUrisStr]);

  logger.info(`Created OAuth client: ${clientId}`);

  // Return client info with plain secret (only time it's available)
  return {
    client_id: clientId,
    client_secret: plainSecret, // Only returned on creation
    allowed_scopes: allowedScopes,
    redirect_uris: redirectUrisStr,
    created_at: new Date().toISOString(),
  };
};

/**
 * Update an existing OAuth client.
 * 
 * @param {string} clientId - Client identifier
 * @param {Object} updates - Fields to update
 * @param {string} [updates.clientSecret] - New client secret (will be hashed)
 * @param {string} [updates.allowedScopes] - New allowed scopes
 * @param {string|string[]} [updates.redirectUris] - New redirect URIs
 * @returns {Object} Updated client info (without secret)
 */
export const updateClient = async (clientId, { clientSecret, allowedScopes, redirectUris }) => {
  // Check if client exists
  const existing = await getRow('SELECT client_id FROM clients WHERE client_id = ?', [clientId]);
  if (!existing) {
    throw new Error(`Client with ID '${clientId}' not found`);
  }

  const updates = [];
  const values = [];

  if (clientSecret !== undefined) {
    if (clientSecret.length < 32) {
      throw new Error('Client secret must be at least 32 characters long');
    }
    const hashedSecret = await hashClientSecret(clientSecret);
    updates.push('client_secret = ?', 'client_secret_hashed = TRUE');
    values.push(hashedSecret, true);
  }

  if (allowedScopes !== undefined) {
    updates.push('allowed_scopes = ?');
    values.push(allowedScopes);
  }

  if (redirectUris !== undefined) {
    const redirectUrisStr = Array.isArray(redirectUris) 
      ? redirectUris.join(',') 
      : redirectUris;
    updates.push('redirect_uris = ?');
    values.push(redirectUrisStr);
  }

  if (updates.length === 0) {
    throw new Error('No fields to update');
  }

  values.push(clientId);

  await executeQuery(`
    UPDATE clients
    SET ${updates.join(', ')}
    WHERE client_id = ?
  `, values);

  logger.info(`Updated OAuth client: ${clientId}`);

  return getClient(clientId);
};

/**
 * Delete an OAuth client.
 * 
 * @param {string} clientId - Client identifier
 * @returns {boolean} True if client was deleted, false if not found
 */
export const deleteClient = async (clientId) => {
  const result = await executeQuery('DELETE FROM clients WHERE client_id = ?', [clientId]);
  
  if (result.changes > 0) {
    logger.info(`Deleted OAuth client: ${clientId}`);
    return true;
  }
  
  return false;
};