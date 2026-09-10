/**
 * /v2/tags routes.
 *
 * `@actual-app/api` 26.9.0 exposes getTags/createTag/updateTag/deleteTag
 * (methods.d.ts:105-108); the wrapper never surfaced them. Every test asserts
 * the exact engine arguments, not just the status code.
 */

import request from 'supertest';
import { buildTestApp, bearer } from '../helpers/app.js';
import { signTestToken } from '../helpers/token.js';
import actualApi, { __reset } from '../mocks/actual-api.js';

const TAG_ID = '3f2c1b9a-1111-4a2b-8c3d-4e5f60718293';

describe('/v2/tags', () => {
  let app;
  let token;

  beforeEach(() => {
    __reset();
    app = buildTestApp();
    token = signTestToken();
  });

  describe('GET /v2/tags', () => {
    it('returns 401 without a token and never reaches the engine', async () => {
      const res = await request(app).get('/v2/tags');

      expect(res.status).toBe(401);
      expect(actualApi.getTags).not.toHaveBeenCalled();
    });

    it('returns 200 with the tags the engine returned', async () => {
      const tags = [{ id: TAG_ID, tag: 'vacation', color: '#ff0000', description: 'Trips' }];
      actualApi.getTags.mockResolvedValueOnce(tags);

      const res = await request(app).get('/v2/tags').set(bearer(token));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, tags });
      expect(actualApi.getTags).toHaveBeenCalledWith();
    });
  });

  describe('POST /v2/tags', () => {
    it('creates a tag and returns 201 with the new id', async () => {
      actualApi.createTag.mockResolvedValueOnce(TAG_ID);

      const res = await request(app)
        .post('/v2/tags')
        .set(bearer(token))
        .send({ tag: { tag: 'vacation', color: '#ff0000', description: 'Trips' } });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ success: true, id: TAG_ID });
      expect(actualApi.createTag).toHaveBeenCalledWith({
        tag: 'vacation',
        color: '#ff0000',
        description: 'Trips',
      });
    });

    it('rejects an empty tag name before touching the engine', async () => {
      const res = await request(app)
        .post('/v2/tags')
        .set(bearer(token))
        .send({ tag: { tag: '' } });

      expect(res.status).toBe(400);
      expect(actualApi.createTag).not.toHaveBeenCalled();
    });
  });

  describe('PUT /v2/tags/:id', () => {
    it('forwards (id, fields) to updateTag', async () => {
      const res = await request(app)
        .put(`/v2/tags/${TAG_ID}`)
        .set(bearer(token))
        .send({ fields: { color: '#00ff00' } });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(actualApi.updateTag).toHaveBeenCalledWith(TAG_ID, { color: '#00ff00' });
    });

    it('rejects an empty fields object', async () => {
      const res = await request(app)
        .put(`/v2/tags/${TAG_ID}`)
        .set(bearer(token))
        .send({ fields: {} });

      expect(res.status).toBe(400);
      expect(actualApi.updateTag).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /v2/tags/:id', () => {
    it('forwards the id to deleteTag', async () => {
      const res = await request(app).delete(`/v2/tags/${TAG_ID}`).set(bearer(token));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(actualApi.deleteTag).toHaveBeenCalledWith(TAG_ID);
    });
  });
});
