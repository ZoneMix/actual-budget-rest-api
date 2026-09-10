/**
 * OAuth2 `allowed_scopes` enforcement, end to end against the real router and
 * the real (sqlite) auth DB.
 *
 * /oauth/authorize used to hand the *requested* `scope` query parameter
 * straight to generateAuthCode, and /oauth/token handed the stored value
 * straight to issueTokens — so a client registered with allowed_scopes='api'
 * could ask for `admin` and get an admin JWT. /oauth/token also never passed
 * the user's DB role, so every token said role='user'.
 *
 * One session login for the whole file on purpose: POST /login is rate limited
 * to 5 attempts per 15 minutes and that limiter is module state shared by every
 * app instance in this module registry.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { buildTestApp } from '../helpers/app.js';
import { ensureAdminUserHash } from '../../src/auth/user.js';
import { createClient } from '../../src/auth/oauth2/client.js';
import { executeQuery } from '../../src/db/authDb.js';

const REDIRECT_URI = 'http://localhost:5678/rest/oauth2-credential/callback';
// Not a credential: generated per run, only ever lives in the test sqlite file.
const TEST_CLIENT_SECRET = `test-client-secret-${crypto.randomUUID()}`;
// Reuses the harness admin password rather than introducing another literal.
const USER_PASSWORD = process.env.ADMIN_PASSWORD;

let app;
let agent;
let userAgent;

/** Register a fresh OAuth client with the given allowed scopes. */
const registerClient = async (allowedScopes) => {
  const clientId = `test-oauth-${crypto.randomUUID()}`;
  await createClient({
    clientId,
    clientSecret: TEST_CLIENT_SECRET,
    allowedScopes,
    redirectUris: REDIRECT_URI,
  });
  return clientId;
};

/** Seed a plain (non-admin) user and return a logged-in agent for it. */
const loginAsUser = async (scopes) => {
  const username = `test-user-${crypto.randomUUID()}`;
  const passwordHash = await bcrypt.hash(USER_PASSWORD, 12);
  await executeQuery(
    'INSERT INTO users (username, password_hash, role, scopes, is_active) VALUES (?, ?, ?, ?, TRUE)',
    [username, passwordHash, 'user', scopes]
  );
  const loggedIn = request.agent(app);
  await loggedIn.post('/login').send({ username, password: USER_PASSWORD });
  return loggedIn;
};

const authorizeAs = (who, clientId, query = {}) =>
  who.get('/oauth/authorize').query({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    ...query,
  });

const authorize = (clientId, query = {}) => authorizeAs(agent, clientId, query);

const locationOf = (res) => new URL(res.headers.location);

const exchangeCode = (clientId, code) =>
  request(app).post('/oauth/token').type('form').send({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: clientId,
    client_secret: TEST_CLIENT_SECRET,
  });

beforeAll(async () => {
  await ensureAdminUserHash();
  app = buildTestApp();
  agent = request.agent(app);
  await agent
    .post('/login')
    .send({ username: process.env.ADMIN_USER || 'admin', password: process.env.ADMIN_PASSWORD });
  // A plain user holding only the legacy api scope — no admin, by role or scope.
  userAgent = await loginAsUser('api');
});

describe('GET /oauth/authorize — requested scope vs allowed_scopes', () => {
  it('refuses a scope the client is not allowed, per RFC 6749 §4.1.2.1', async () => {
    const clientId = await registerClient('api');

    const res = await authorize(clientId, { scope: 'admin', state: 'state-123' });

    expect(res.status).toBe(302);
    const location = locationOf(res);
    expect(location.origin + location.pathname).toBe(REDIRECT_URI);
    expect(location.searchParams.get('error')).toBe('invalid_scope');
    expect(location.searchParams.get('error_description')).toContain('admin');
    expect(location.searchParams.get('state')).toBe('state-123');
    expect(location.searchParams.get('code')).toBeNull();
  });

  it('tells an unauthenticated caller nothing about the client scopes', async () => {
    // Answering invalid_scope before the login redirect would let anyone probe
    // any client's allowed_scopes one request at a time, without an account.
    const clientId = await registerClient('api');

    const res = await request(app).get('/oauth/authorize').query({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'admin',
    });

    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login\?/);
    expect(res.headers.location).not.toContain('invalid_scope');
  });

  it('issues a code for an allowed scope and carries state through', async () => {
    const clientId = await registerClient('api');

    const res = await authorize(clientId, { scope: 'api', state: 'state-456' });

    expect(res.status).toBe(302);
    const location = locationOf(res);
    expect(location.searchParams.get('code')).toMatch(/^[a-f0-9]{64}$/);
    expect(location.searchParams.get('state')).toBe('state-456');
    expect(location.searchParams.get('error')).toBeNull();
  });

  it('accepts a scope the client holds by implication', async () => {
    const clientId = await registerClient('api');

    const res = await authorize(clientId, { scope: 'read' });

    expect(locationOf(res).searchParams.get('code')).toBeTruthy();
  });

  it('accepts a space-separated scope list and grants it sorted', async () => {
    const clientId = await registerClient(['read', 'write']);

    const res = await authorize(clientId, { scope: 'write read' });
    const code = locationOf(res).searchParams.get('code');
    const tokenRes = await exchangeCode(clientId, code);

    expect(tokenRes.status).toBe(200);
    expect(tokenRes.body.scope).toBe('read,write');
  });

  it('refuses when only one scope of several is disallowed', async () => {
    const clientId = await registerClient('read');

    const res = await authorize(clientId, { scope: 'read write' });

    expect(locationOf(res).searchParams.get('error')).toBe('invalid_scope');
  });

  it('defaults to the legacy api scope when none is requested', async () => {
    const clientId = await registerClient('api');

    const res = await authorize(clientId);
    const code = locationOf(res).searchParams.get('code');
    const tokenRes = await exchangeCode(clientId, code);

    expect(tokenRes.body.scope).toBe('api');
  });
});

describe('POST /oauth/token — granted scope and role', () => {
  it('issues a token limited to the granted scope, with the user DB role', async () => {
    const clientId = await registerClient('api');
    const res = await authorize(clientId, { scope: 'api' });
    const code = locationOf(res).searchParams.get('code');

    const tokenRes = await exchangeCode(clientId, code);

    expect(tokenRes.status).toBe(200);
    const decoded = jwt.decode(tokenRes.body.access_token);
    expect(decoded.scope).toBe('api');
    expect(decoded.scopes).toEqual(['api']);
    expect(decoded.role).toBe('admin');
  });

  it('keeps a narrow grant across a refresh instead of widening it', async () => {
    // Granted `read` through a client that may grant the whole legacy api set.
    // The refresh must narrow back to what was granted, not to what the user
    // could have asked for — that is what the refresh token's scope claim is for.
    const clientId = await registerClient('api');
    const res = await authorize(clientId, { scope: 'read' });
    const code = locationOf(res).searchParams.get('code');
    const { body: tokens } = await exchangeCode(clientId, code);
    expect(jwt.decode(tokens.access_token).scope).toBe('read');

    const refreshed = await request(app).post('/oauth/token').type('form').send({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: clientId,
      client_secret: TEST_CLIENT_SECRET,
    });

    expect(refreshed.status).toBe(200);
    expect(jwt.decode(refreshed.body.access_token).scope).toBe('read');
  });

  it('re-intersects on refresh, dropping a scope the client does not allow', async () => {
    // The admin user's DB scopes are api,admin; this client only allows api.
    const clientId = await registerClient('api');
    const res = await authorize(clientId, { scope: 'api' });
    const code = locationOf(res).searchParams.get('code');
    const { body: tokens } = await exchangeCode(clientId, code);

    const refreshed = await request(app).post('/oauth/token').type('form').send({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: clientId,
      client_secret: TEST_CLIENT_SECRET,
    });

    expect(refreshed.status).toBe(200);
    const decoded = jwt.decode(refreshed.body.access_token);
    expect(decoded.scope).toBe('api');
    expect(decoded.scope).not.toContain('admin');
    expect(decoded.role).toBe('admin');
  });
});

describe('a grant is bounded by the signed-in user, not only by the client', () => {
  it('refuses a non-admin asking for admin through a client that allows it', async () => {
    const clientId = await registerClient('api,admin');

    const res = await authorizeAs(userAgent, clientId, { scope: 'admin' });

    expect(locationOf(res).searchParams.get('error')).toBe('invalid_scope');
    expect(locationOf(res).searchParams.get('code')).toBeNull();
  });

  it('drops admin from a mixed request and the token is refused by /admin', async () => {
    const clientId = await registerClient('api,admin');

    const res = await authorizeAs(userAgent, clientId, { scope: 'api admin' });
    const code = locationOf(res).searchParams.get('code');
    const tokenRes = await exchangeCode(clientId, code);

    expect(tokenRes.status).toBe(200);
    const decoded = jwt.decode(tokenRes.body.access_token);
    expect(decoded.scope).toBe('api');
    expect(decoded.role).toBe('user');

    const adminRes = await request(app)
      .get('/admin/oauth-clients')
      .set('Accept', 'application/json')
      .set({ Authorization: `Bearer ${tokenRes.body.access_token}` });

    expect(adminRes.status).toBe(403);
  });

  it('still lets an admin user take the admin scope', async () => {
    const clientId = await registerClient('api,admin');

    const res = await authorize(clientId, { scope: 'admin' });
    const code = locationOf(res).searchParams.get('code');
    const tokenRes = await exchangeCode(clientId, code);

    expect(jwt.decode(tokenRes.body.access_token).scope).toBe('admin');
  });
});

/**
 * RFC 6749 §3.3: when the request omits `scope`, the server uses "a
 * pre-defined default value" — which for a registered client is its own
 * `allowed_scopes`, not a global constant.
 *
 * The default was hard-coded to the legacy `api` scope, so a client registered
 * `allowed_scopes=read` was refused with invalid_scope unless it remembered to
 * send `scope=read` on every request — for the one scope it is registered to
 * hold.
 */
describe('a request with no scope falls back to the client registration', () => {
  it('issues the client its own scope instead of refusing it', async () => {
    const clientId = await registerClient('read');

    const res = await authorize(clientId);
    const location = locationOf(res);

    expect(location.searchParams.get('error')).toBeNull();
    const code = location.searchParams.get('code');
    expect(code).not.toBeNull();

    const tokenRes = await exchangeCode(clientId, code);

    expect(tokenRes.status).toBe(200);
    expect(jwt.decode(tokenRes.body.access_token).scope).toBe('read');
  });

  it('leaves a client registered for the legacy api scope unchanged', async () => {
    const clientId = await registerClient('api');

    const res = await authorize(clientId);
    const code = locationOf(res).searchParams.get('code');
    const tokenRes = await exchangeCode(clientId, code);

    expect(jwt.decode(tokenRes.body.access_token).scope).toBe('api');
  });

  it('is still bounded by what the signed-in user holds', async () => {
    const clientId = await registerClient('admin');

    const res = await authorizeAs(userAgent, clientId);

    expect(locationOf(res).searchParams.get('error')).toBe('invalid_scope');
    expect(locationOf(res).searchParams.get('code')).toBeNull();
  });
});
