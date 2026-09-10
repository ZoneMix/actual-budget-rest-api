/**
 * /v2/category-groups — the `hidden` filter and the delete-with-transfer option.
 *
 * Mirrors the category endpoints: `getCategoryGroups(options?)` and
 * `deleteCategoryGroup(id, transferCategoryId?)` (methods.d.ts:86-91) take an
 * optional trailing argument that must be omitted, not passed as `undefined`,
 * when the caller does not supply it.
 */

import request from 'supertest';
import { buildTestApp, bearer } from '../helpers/app.js';
import { signTestToken } from '../helpers/token.js';
import actualApi, { __reset } from '../mocks/actual-api.js';

const GROUP_ID = '2b3c4d5e-6666-4e7f-8091-a2b3c4d5e6f7';
const TRANSFER_ID = '7a6b5c4d-7777-4f80-91a2-b3c4d5e6f708';

describe('/v2/category-groups', () => {
  let app;
  let token;

  beforeEach(() => {
    __reset();
    app = buildTestApp();
    token = signTestToken();
  });

  describe('GET /v2/category-groups?hidden=', () => {
    it('calls getCategoryGroups() with no argument when hidden is absent', async () => {
      await request(app).get('/v2/category-groups').set(bearer(token));

      expect(actualApi.getCategoryGroups).toHaveBeenCalledWith();
    });

    it('forwards hidden=true as { hidden: true }', async () => {
      const res = await request(app).get('/v2/category-groups?hidden=true').set(bearer(token));

      expect(res.status).toBe(200);
      expect(actualApi.getCategoryGroups).toHaveBeenCalledWith({ hidden: true });
    });

    it('forwards hidden=false as { hidden: false }, not as truthy', async () => {
      await request(app).get('/v2/category-groups?hidden=false').set(bearer(token));

      expect(actualApi.getCategoryGroups).toHaveBeenCalledWith({ hidden: false });
    });

    it('rejects a non-boolean hidden value', async () => {
      const res = await request(app).get('/v2/category-groups?hidden=maybe').set(bearer(token));

      expect(res.status).toBe(400);
      expect(actualApi.getCategoryGroups).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /v2/category-groups/:id?transferCategoryId=', () => {
    it('calls deleteCategoryGroup(id) with no second argument by default', async () => {
      const res = await request(app).delete(`/v2/category-groups/${GROUP_ID}`).set(bearer(token));

      expect(res.status).toBe(200);
      expect(actualApi.deleteCategoryGroup).toHaveBeenCalledWith(GROUP_ID);
    });

    it('forwards transferCategoryId as the second argument', async () => {
      const res = await request(app)
        .delete(`/v2/category-groups/${GROUP_ID}?transferCategoryId=${TRANSFER_ID}`)
        .set(bearer(token));

      expect(res.status).toBe(200);
      expect(actualApi.deleteCategoryGroup).toHaveBeenCalledWith(GROUP_ID, TRANSFER_ID);
    });
  });
});
