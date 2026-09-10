/**
 * Regression test: the nested transactions router must be mounted on
 * accountsRoutes exactly once, no matter how many times createApp() runs.
 *
 * src/app.js used to call accountsRoutes.use('/:accountId/transactions', ...)
 * inside createApp() itself, mutating the shared (module-singleton) router on
 * every call. Two createApp() calls in one test file left two mount layers
 * stacked on accountsRoutes.
 *
 * A GET request that the nested router fully handles can't tell 1 mount from
 * N mounts on its own: Express only advances to a sibling '.use()' layer when
 * the current one calls next(), and a handler that sends a response (as
 * GET /:accountId/transactions does) never does. Confirmed empirically
 * against the pre-fix code: getTransactions was still called exactly once
 * with two mounts stacked. What actually doubles is accountsRoutes' own
 * layer count, so that's asserted directly alongside the HTTP behaviour.
 */

import crypto from 'crypto';
import request from 'supertest';
import { buildTestApp, bearer } from '../helpers/app.js';
import { signTestToken } from '../helpers/token.js';
import accountsRoutes from '../../src/routes/accounts.js';
import actualApi, { __reset } from '../mocks/actual-api.js';

describe('nested transactions router mount', () => {
  it('mounts the nested transactions router exactly once, even when createApp() runs more than once', async () => {
    __reset();
    const accountId = crypto.randomUUID();
    actualApi.getAccounts.mockResolvedValue([{ id: accountId, name: 'Checking' }]);
    actualApi.getTransactions.mockResolvedValue([]);

    const routerLayersBefore = accountsRoutes.stack.filter((layer) => layer.name === 'router').length;

    // Two createApp() calls in this file, matching how buildTestApp() gets
    // called once per test elsewhere in the suite (e.g. accounts.test.js).
    buildTestApp();
    const app = buildTestApp();

    const routerLayersAfter = accountsRoutes.stack.filter((layer) => layer.name === 'router').length;
    expect(routerLayersAfter).toBe(routerLayersBefore);

    const token = signTestToken();
    const res = await request(app)
      .get(`/v2/accounts/${accountId}/transactions`)
      .set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(actualApi.getTransactions).toHaveBeenCalledTimes(1);
  });
});
