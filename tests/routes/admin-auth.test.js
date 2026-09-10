/**
 * /admin/* Bearer-token authentication.
 *
 * authenticateAdminAPI's JWT branch called `isTokenRevoked(payload.jti)`
 * without awaiting it. An async function always returns a Promise, a Promise is
 * always truthy, so `!isTokenRevoked(...)` was always false and no Bearer token
 * ever authenticated against /admin/* — the whole JWT path was dead code and
 * only the session path worked.
 *
 * These tests drive the real router with real tokens: an admin token gets in, a
 * non-admin token is refused by the role check, and a revoked token is refused
 * by the revocation check that now actually runs.
 *
 * `Accept: application/json` matters — without it the middleware redirects an
 * unauthenticated *browser* request to /login (302) instead of answering 401.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import crypto from 'crypto';
import { buildTestApp, bearer } from '../helpers/app.js';
import { signTestToken } from '../helpers/token.js';
import { revokeToken } from '../../src/auth/jwt.js';

let app;

beforeEach(() => {
  app = buildTestApp();
});

describe('GET /admin/oauth-clients with a Bearer token', () => {
  it('lets an admin JWT through', async () => {
    const token = signTestToken({ role: 'admin', scopes: 'api,admin' });

    const res = await request(app)
      .get('/admin/oauth-clients')
      .set('Accept', 'application/json')
      .set(bearer(token));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.clients)).toBe(true);
  });

  it('refuses a non-admin JWT with 403', async () => {
    const token = signTestToken({ role: 'user', scopes: 'api' });

    const res = await request(app)
      .get('/admin/oauth-clients')
      .set('Accept', 'application/json')
      .set(bearer(token));

    expect(res.status).toBe(403);
  });

  // `isAdmin` checks the GRANT, not the role claim: an admin can deliberately
  // issue a narrow token (an `api`-only OAuth client, for instance) and that
  // token must not reach the admin API just because the person is an admin.
  it('refuses an admin-role JWT whose scopes stop short of admin', async () => {
    const token = signTestToken({ role: 'admin', scopes: 'read' });

    const res = await request(app)
      .get('/admin/oauth-clients')
      .set('Accept', 'application/json')
      .set(bearer(token));

    expect(res.status).toBe(403);
  });

  it('refuses an admin-role JWT carrying only the legacy api scope', async () => {
    const token = signTestToken({ role: 'admin', scopes: 'api' });

    const res = await request(app)
      .get('/admin/oauth-clients')
      .set('Accept', 'application/json')
      .set(bearer(token));

    expect(res.status).toBe(403);
  });

  it('refuses a revoked admin JWT with 401', async () => {
    const jti = crypto.randomUUID();
    await revokeToken(jti);
    const token = signTestToken({ role: 'admin', scopes: 'api,admin', jti });

    const res = await request(app)
      .get('/admin/oauth-clients')
      .set('Accept', 'application/json')
      .set(bearer(token));

    expect(res.status).toBe(401);
  });
});
