/**
 * GET /v2/health
 */

import request from 'supertest';
import { buildTestApp } from '../helpers/app.js';

describe('GET /v2/health', () => {
  it('returns 200 with a status field when checks pass', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/v2/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body.checks.database.status).toBe('ok');
    expect(res.body.checks.actualApi.status).toBe('ok');
  });
});
