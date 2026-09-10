/**
 * authenticateJWT — what the verifier refuses.
 *
 * `jwt.verify` was called with the secret alone: no `algorithms`, no `issuer`,
 * no `audience`. Anything signed with the shared secret was accepted no matter
 * who minted it or which HMAC variant it used. These tests pin each of those
 * refusals, plus the two behaviours that must survive: a good token populates
 * `req.user`, and a revoked jti is still rejected.
 *
 * The middleware is driven directly (no supertest) so the assertions are about
 * the verifier and nothing else — no router, no rate limiter, no mock engine.
 */

import { describe, it, expect, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { authenticateJWT, revokeToken, issueTokens } from '../../src/auth/jwt.js';
import { JWT_ISSUER, JWT_AUDIENCE } from '../../src/config/index.js';

const basePayload = (overrides = {}) => ({
  user_id: 1,
  username: 'tester',
  role: 'user',
  scope: 'api',
  scopes: ['api'],
  iss: JWT_ISSUER,
  aud: JWT_AUDIENCE,
  ...overrides,
});

const sign = (overrides = {}, options = {}) =>
  jwt.sign(basePayload(overrides), process.env.JWT_SECRET, {
    expiresIn: '1h',
    jwtid: crypto.randomUUID(),
    ...options,
  });

/** A token whose header claims `alg: none` and carries no signature at all. */
const unsignedToken = () => {
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const header = encode({ alg: 'none', typ: 'JWT' });
  const payload = encode({
    ...basePayload(),
    jti: crypto.randomUUID(),
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  return `${header}.${payload}.`;
};

const invoke = async (token) => {
  const req = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ip: '127.0.0.1',
    method: 'GET',
    path: '/',
    originalUrl: '/v2/accounts',
  };
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  const next = jest.fn();
  await authenticateJWT(req, res, next);
  return { req, res, next };
};

describe('issueTokens', () => {
  it('records the granted scope on the refresh token too', async () => {
    // Without this claim a refresh has nothing to narrow back to and falls back
    // to the user's full DB scopes, widening a deliberately narrow grant.
    const tokens = await issueTokens(1, 'tester', 'read', 'user');
    const refresh = jwt.decode(tokens.refresh_token);

    expect(refresh.scope).toBe('read');
    expect(refresh.scopes).toEqual(['read']);
    expect(refresh.iss).toBe(JWT_ISSUER);
    expect(refresh.aud).toBe(JWT_AUDIENCE);
  });
});

describe('authenticateJWT — accepted', () => {
  it('sets req.user from a well-formed token', async () => {
    const { req, next, res } = await invoke(sign());

    expect(next).toHaveBeenCalledWith();
    expect(res.statusCode).toBeNull();
    expect(req.user).toMatchObject({ user_id: 1, username: 'tester', scope: 'api' });
  });

  it('no longer scope-gates by router-relative path', async () => {
    // The old "basic scope enforcement" block tested req.path.startsWith('/accounts'),
    // which never matched because routers mount at /v2/... — dead code, now gone.
    const { next } = await invoke(sign({ scope: 'read', scopes: ['read'] }));

    expect(next).toHaveBeenCalledWith();
  });
});

describe('authenticateJWT — refused', () => {
  it('rejects a token from another issuer', async () => {
    const { res, next } = await invoke(sign({ iss: 'someone-else' }));

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a token for another audience', async () => {
    const { res, next } = await invoke(sign({ aud: 'another-app' }));

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects an unsigned alg:none token', async () => {
    const { res, next } = await invoke(unsignedToken());

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a token signed with a different HMAC algorithm', async () => {
    const { res, next } = await invoke(sign({}, { algorithm: 'HS512' }));

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a revoked jti', async () => {
    const jti = crypto.randomUUID();
    await revokeToken(jti);

    const { res, next } = await invoke(sign({}, { jwtid: jti }));

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Token has been revoked' });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a missing token', async () => {
    const { res, next } = await invoke(undefined);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});
