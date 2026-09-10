/**
 * /v2/rules routes.
 *
 * PUT is the interesting one: the SDK replaces the whole rule, so the route
 * has to surface a missing rule as a 404 rather than writing a half-rule.
 */

import request from 'supertest';
import { buildTestApp, bearer } from '../helpers/app.js';
import { signTestToken } from '../helpers/token.js';
import actualApi, { __reset } from '../mocks/actual-api.js';

const CONDITIONS = [{ field: 'payee', op: 'is', value: 'p-1' }];
const ACTIONS = [{ op: 'set', field: 'category', value: 'c-1' }];

const existingRule = {
  id: 'r-1',
  stage: 'pre',
  conditionsOp: 'and',
  conditions: CONDITIONS,
  actions: ACTIONS,
};

describe('/v2/rules', () => {
  let app;
  let token;

  beforeEach(() => {
    __reset();
    app = buildTestApp();
    token = signTestToken();
  });

  describe('PUT /v2/rules/:id', () => {
    it('merges the partial update onto the current rule', async () => {
      actualApi.getRules.mockResolvedValue([existingRule]);
      actualApi.updateRule.mockResolvedValueOnce({ ...existingRule, stage: 'post' });

      const res = await request(app)
        .put('/v2/rules/r-1')
        .set(bearer(token))
        .send({ fields: { stage: 'post' } });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, rule: { ...existingRule, stage: 'post' } });
      expect(actualApi.updateRule).toHaveBeenCalledWith({
        id: 'r-1',
        stage: 'post',
        conditionsOp: 'and',
        conditions: CONDITIONS,
        actions: ACTIONS,
      });
    });

    it('returns 404 when the rule does not exist', async () => {
      actualApi.getRules.mockResolvedValue([{ ...existingRule, id: 'r-other' }]);

      const res = await request(app)
        .put('/v2/rules/r-1')
        .set(bearer(token))
        .send({ fields: { stage: 'post' } });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
      expect(actualApi.updateRule).not.toHaveBeenCalled();
    });

    it('rejects an empty fields object before touching the engine', async () => {
      const res = await request(app)
        .put('/v2/rules/r-1')
        .set(bearer(token))
        .send({ fields: {} });

      expect(res.status).toBe(400);
      expect(actualApi.getRules).not.toHaveBeenCalled();
    });
  });
});
