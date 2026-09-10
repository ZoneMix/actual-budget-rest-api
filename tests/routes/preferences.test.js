/**
 * GET /v2/preferences.
 *
 * `getPreferences()` resolves the budget's SyncedPrefs (methods.d.ts:134) —
 * an open-ended key/value map whose keys the engine owns. The route hands it
 * back unchanged rather than picking fields, so a new preference in a later
 * SDK reaches callers without a wrapper change.
 */

import request from 'supertest';
import { buildTestApp, bearer } from '../helpers/app.js';
import { signTestToken } from '../helpers/token.js';
import actualApi, { __reset } from '../mocks/actual-api.js';

describe('/v2/preferences', () => {
  let app;
  let token;

  beforeEach(() => {
    __reset();
    app = buildTestApp();
    token = signTestToken();
  });

  it('returns 401 without a token and never reaches the engine', async () => {
    const res = await request(app).get('/v2/preferences');

    expect(res.status).toBe(401);
    expect(actualApi.getPreferences).not.toHaveBeenCalled();
  });

  it('returns the engine preferences object unchanged', async () => {
    const preferences = {
      dateFormat: 'MM/dd/yyyy',
      numberFormat: 'comma-dot',
      hideFraction: 'false',
      firstDayOfWeekIdx: '0',
    };
    actualApi.getPreferences.mockResolvedValueOnce(preferences);

    const res = await request(app).get('/v2/preferences').set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, preferences });
    expect(actualApi.getPreferences).toHaveBeenCalledWith();
  });
});
