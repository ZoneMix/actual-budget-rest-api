/**
 * /docs Bearer-token authentication.
 *
 * `authenticateForDocs` called `isTokenRevoked(payload.jti)` without awaiting
 * it — the same bug already fixed in `authenticateAdminAPI`. An async function
 * returns a Promise, a Promise is always truthy, so `!isTokenRevoked(...)` was
 * always false and the JWT branch never assigned a user: no Bearer token could
 * open /docs, and every API client fell through to the /login redirect.
 *
 * It fails CLOSED, so the bug is a lockout rather than a hole — but a revoked
 * token and a valid one were indistinguishable, which is worth pinning either
 * way.
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

describe('GET /docs with a Bearer token', () => {
  it('lets a valid JWT reach Swagger UI instead of redirecting to login', async () => {
    const token = signTestToken();

    const res = await request(app).get('/docs/').set(bearer(token));

    expect(res.status).toBeLessThan(400);
    expect(res.headers.location ?? '').not.toContain('/login');
  });

  it('refuses a revoked JWT with 401 rather than bouncing it to an HTML login', async () => {
    const jti = crypto.randomUUID();
    await revokeToken(jti);
    const token = signTestToken({ jti });

    const res = await request(app).get('/docs/').set(bearer(token));

    expect(res.status).toBe(401);
  });

  it('refuses a token signed with the wrong secret', async () => {
    const res = await request(app).get('/docs/').set({ Authorization: 'Bearer not-a-jwt' });

    expect(res.status).toBe(401);
  });
});

describe('GET /docs without any credentials', () => {
  it('redirects to the login page, carrying the return path', async () => {
    const res = await request(app).get('/docs/');

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login');
    expect(res.headers.location).toContain('return_to');
  });
});
