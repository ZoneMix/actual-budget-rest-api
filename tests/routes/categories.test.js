/**
 * /v2/categories — the `hidden` filter and the delete-with-transfer option.
 *
 * `getCategories(options?)` and `deleteCategory(id, transferCategoryId?)`
 * (methods.d.ts:92-97) both take an OPTIONAL trailing argument. When the caller
 * gives neither, the wrapper must omit the argument entirely rather than pass
 * `undefined`: that keeps today's call shape, which the SDK distinguishes.
 */

import request from 'supertest';
import { buildTestApp, bearer } from '../helpers/app.js';
import { signTestToken } from '../helpers/token.js';
import actualApi, { __reset } from '../mocks/actual-api.js';

const CATEGORY_ID = '1a2b3c4d-4444-4c5d-8e6f-708192a3b4c5';
const TRANSFER_ID = '6f5e4d3c-5555-4d6e-8f70-8192a3b4c5d6';

describe('/v2/categories', () => {
  let app;
  let token;

  beforeEach(() => {
    __reset();
    app = buildTestApp();
    token = signTestToken();
  });

  describe('GET /v2/categories?hidden=', () => {
    it('calls getCategories() with no argument when hidden is absent', async () => {
      await request(app).get('/v2/categories').set(bearer(token));

      expect(actualApi.getCategories).toHaveBeenCalledWith();
    });

    it('forwards hidden=true as { hidden: true }', async () => {
      const res = await request(app).get('/v2/categories?hidden=true').set(bearer(token));

      expect(res.status).toBe(200);
      expect(actualApi.getCategories).toHaveBeenCalledWith({ hidden: true });
    });

    it('forwards hidden=false as { hidden: false }, not as truthy', async () => {
      await request(app).get('/v2/categories?hidden=false').set(bearer(token));

      expect(actualApi.getCategories).toHaveBeenCalledWith({ hidden: false });
    });

    it('rejects a non-boolean hidden value', async () => {
      const res = await request(app).get('/v2/categories?hidden=maybe').set(bearer(token));

      expect(res.status).toBe(400);
      expect(actualApi.getCategories).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /v2/categories/:id?transferCategoryId=', () => {
    it('calls deleteCategory(id) with no second argument by default', async () => {
      const res = await request(app).delete(`/v2/categories/${CATEGORY_ID}`).set(bearer(token));

      expect(res.status).toBe(200);
      expect(actualApi.deleteCategory).toHaveBeenCalledWith(CATEGORY_ID);
    });

    it('forwards transferCategoryId as the second argument', async () => {
      const res = await request(app)
        .delete(`/v2/categories/${CATEGORY_ID}?transferCategoryId=${TRANSFER_ID}`)
        .set(bearer(token));

      expect(res.status).toBe(200);
      expect(actualApi.deleteCategory).toHaveBeenCalledWith(CATEGORY_ID, TRANSFER_ID);
    });
  });
});
