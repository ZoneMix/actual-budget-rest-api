/**
 * POST/PUT/GET /admin/oauth-clients — allowed_scopes storage.
 *
 * CreateClientSchema/UpdateClientSchema now parse allowed_scopes into an
 * array (src/validation/admin.js). The `clients.allowed_scopes` column is
 * TEXT (src/db/authDb.js) and every value is bound straight through a `?`/
 * `$1` placeholder: better-sqlite3 throws on an array param, and pg would
 * silently write a Postgres array literal into the column. This exercises
 * the real route + real (sqlite, test) DB — no mocking — so the fix in
 * src/auth/oauth2/client.js is proven against an actual bound query, not
 * just a unit-level assumption about what it does with the value.
 *
 * Authenticates via session login (POST /login) rather than a JWT bearer
 * token, exercising the session branch of src/auth/adminApi.js. (Its JWT
 * branch used to be dead — `isTokenRevoked(payload.jti)` was not awaited, so
 * no Bearer token ever authenticated; that is fixed and covered separately in
 * tests/routes/admin-auth.test.js.) ensureAdminUserHash() (called at real
 * server startup, bypassed by the test harness's createApp()) is invoked
 * directly here to seed the admin user so the login flow is exercised for real.
 */
import request from 'supertest';
import crypto from 'crypto';
import { buildTestApp } from '../helpers/app.js';
import { ensureAdminUserHash } from '../../src/auth/user.js';

const ADMIN_USERNAME = process.env.ADMIN_USER || 'admin';

describe('/admin/oauth-clients allowed_scopes storage', () => {
  let app;
  let agent;

  beforeEach(async () => {
    await ensureAdminUserHash();
    app = buildTestApp();
    agent = request.agent(app);
    await agent.post('/login').send({ username: ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD });
  });

  it('stores a comma-string allowed_scopes and returns it unchanged', async () => {
    const clientId = `test-client-${crypto.randomUUID()}`;

    const createRes = await agent
      .post('/admin/oauth-clients')
      .send({ client_id: clientId, allowed_scopes: 'read,write' });

    expect(createRes.status).toBe(201);
    expect(createRes.body.client.allowed_scopes).toBe('read,write');

    const getRes = await agent.get(`/admin/oauth-clients/${clientId}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.client.allowed_scopes).toBe('read,write');
  });

  it('stores an array allowed_scopes as the equivalent comma string (not a bind error)', async () => {
    const clientId = `test-client-${crypto.randomUUID()}`;

    const createRes = await agent
      .post('/admin/oauth-clients')
      .send({ client_id: clientId, allowed_scopes: ['read'] });

    expect(createRes.status).toBe(201);
    expect(createRes.body.client.allowed_scopes).toBe('read');

    const getRes = await agent.get(`/admin/oauth-clients/${clientId}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.client.allowed_scopes).toBe('read');
  });

  it('PUT with an array allowed_scopes updates it to the equivalent comma string', async () => {
    const clientId = `test-client-${crypto.randomUUID()}`;
    await agent.post('/admin/oauth-clients').send({ client_id: clientId, allowed_scopes: 'api' });

    const putRes = await agent
      .put(`/admin/oauth-clients/${clientId}`)
      .send({ allowed_scopes: ['read', 'write', 'admin'] });

    expect(putRes.status).toBe(200);
    expect(putRes.body.client.allowed_scopes).toBe('read,write,admin');
  });
});
