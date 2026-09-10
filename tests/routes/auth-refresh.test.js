/**
 * POST /v2/auth/login, refresh-token flow — the non-OAuth way to trade a
 * refresh token for a new access token.
 *
 * It reads the same refresh tokens `issueTokens()` mints, so it is the second
 * door on the narrowing fix: if this endpoint keeps falling back to the user's
 * full DB scopes, a `read` refresh token still comes back as `api` here even
 * though /oauth/token now refuses to widen it.
 *
 * There is no client in this flow, so the grant is bounded by two things
 * instead of three: what the refresh token was granted, and what the user's row
 * still holds.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { buildTestApp } from '../helpers/app.js';
import { issueTokens } from '../../src/auth/jwt.js';
import { executeQuery, getRow } from '../../src/db/authDb.js';

const USER_PASSWORD = process.env.ADMIN_PASSWORD;

let app;
let userId;
let username;

beforeAll(async () => {
  app = buildTestApp();
  username = `test-refresh-${crypto.randomUUID()}`;
  const passwordHash = await bcrypt.hash(USER_PASSWORD, 12);
  await executeQuery(
    'INSERT INTO users (username, password_hash, role, scopes, is_active) VALUES (?, ?, ?, ?, TRUE)',
    [username, passwordHash, 'user', 'api,admin']
  );
  const row = await getRow('SELECT id FROM users WHERE username = ?', [username]);
  userId = row.id;
});

describe('refresh-token login', () => {
  it('keeps the granted scope instead of widening to the user row', async () => {
    // Granted `read`, though the user's row holds api,admin.
    const { refresh_token } = await issueTokens(userId, username, 'read', 'user');

    const res = await request(app).post('/v2/auth/login').send({ refresh_token });

    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('read');
    expect(jwt.decode(res.body.access_token).scope).toBe('read');
  });

  it('drops a scope the user no longer holds', async () => {
    const { refresh_token } = await issueTokens(userId, username, 'api,admin', 'user');
    await executeQuery('UPDATE users SET scopes = ? WHERE id = ?', ['api', userId]);

    const res = await request(app).post('/v2/auth/login').send({ refresh_token });

    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('api');
    expect(res.body.scope).not.toContain('admin');
  });
});
