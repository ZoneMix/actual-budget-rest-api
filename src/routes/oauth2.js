/**
 * OAuth2 Authorization Server endpoints for n8n integration.
 */

import express from 'express';
import { validateClient } from '../auth/oauth2/client.js';
import { generateAuthCode } from '../auth/oauth2/code.js';
import { validateAuthCode } from '../auth/oauth2/code.js';
import { issueTokens } from '../auth/jwt.js';
import { getDb } from '../db/authDb.js';

const router = express.Router();

// GET /oauth/authorize
router.get('/authorize', async (req, res) => {
  const { client_id, redirect_uri, scope = 'api', state, response_type = 'code' } = req.query;

  if (response_type !== 'code') return res.status(400).json({ error: 'Unsupported response_type' });

  if (!client_id || !redirect_uri) return res.status(400).json({ error: 'Missing parameters' });

  const db = getDb();
  const client = db.prepare('SELECT * FROM clients WHERE client_id = ?').get(client_id);
  if (!client) return res.status(400).json({ error: 'Invalid client_id' });

  const allowedUris = client.redirect_uris.split(',');
  if (!allowedUris.includes(redirect_uri)) return res.status(400).json({ error: 'Invalid redirect_uri' });

  // Require session login
  if (!req.session.user) {
    const params = new URLSearchParams({ ...req.query, return_to: req.originalUrl });
    return res.redirect(`/login?${params}`);
  }

  // Auto-approve (dev). In prod you would show a consent screen.
  const code = generateAuthCode(client_id, req.session.user.id, redirect_uri, scope);
  const redirect = `${redirect_uri}?code=${code}${state ? `&state=${state}` : ''}`;
  res.redirect(redirect);
});

// POST /oauth/token
router.post('/token', express.urlencoded({ extended: true }), async (req, res) => {
  const { grant_type, code, client_id, client_secret, redirect_uri } = req.body;

  if (grant_type !== 'authorization_code') {
    return res.status(400).json({ error: 'Unsupported grant_type' });
  }

  try {
    validateClient(client_id, client_secret);
    const { userId, scope } = validateAuthCode(code, client_id, redirect_uri);

    const db = getDb();
    const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
    if (!user) throw new Error('User not found');

    const tokens = issueTokens(userId, user.username, scope);
    res.json(tokens);
  } catch (err) {
    res.status(400).json({ error: 'invalid_request', error_description: err.message });
  }
});

export default router;