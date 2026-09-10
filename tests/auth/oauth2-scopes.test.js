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
import { buildTestApp } from '../helpers/app.js';
import { ensureAdminUserHash } from '../../src/auth/user.js';
import { createClient } from '../../src/auth/oauth2/client.js';

const REDIRECT_URI = 'http://localhost:5678/rest/oauth2-credential/callback';
// Not a credential: generated per run, only ever lives in the test sqlite file.
const TEST_CLIENT_SECRET = `test-client-secret-${crypto.randomUUID()}`;

let app;
let agent;

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

const authorize = (clientId, query = {}) =>
  agent.get('/oauth/authorize').query({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    ...query,
  });

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
