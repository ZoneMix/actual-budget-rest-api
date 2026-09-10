/**
 * /v2/account-groups routes.
 *
 * Account groups are the 26.9.0 addition that lets accounts be foldered in the
 * sidebar (methods.d.ts:82-85). `createAccountGroup` takes the group object,
 * `updateAccountGroup` takes (id, fields), `deleteAccountGroup` takes the id.
 */

import request from 'supertest';
import { buildTestApp, bearer } from '../helpers/app.js';
import { signTestToken } from '../helpers/token.js';
import actualApi, { __reset } from '../mocks/actual-api.js';

const GROUP_ID = '5c4d3e2f-3333-4b5c-8d6e-7f8091a2b3c4';

describe('/v2/account-groups', () => {
  let app;
  let token;

  beforeEach(() => {
    __reset();
    app = buildTestApp();
    token = signTestToken();
  });

  describe('GET /v2/account-groups', () => {
    it('returns 401 without a token and never reaches the engine', async () => {
      const res = await request(app).get('/v2/account-groups');

      expect(res.status).toBe(401);
      expect(actualApi.getAccountGroups).not.toHaveBeenCalled();
    });

    it('returns the account groups the engine returned', async () => {
      const accountGroups = [{ id: GROUP_ID, name: 'Everyday' }];
      actualApi.getAccountGroups.mockResolvedValueOnce(accountGroups);

      const res = await request(app).get('/v2/account-groups').set(bearer(token));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, accountGroups });
      expect(actualApi.getAccountGroups).toHaveBeenCalledWith();
    });
  });

  describe('POST /v2/account-groups', () => {
    it('creates a group and returns 201 with the new id', async () => {
      actualApi.createAccountGroup.mockResolvedValueOnce(GROUP_ID);

      const res = await request(app)
        .post('/v2/account-groups')
        .set(bearer(token))
        .send({ group: { name: 'Everyday' } });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ success: true, id: GROUP_ID });
      expect(actualApi.createAccountGroup).toHaveBeenCalledWith({ name: 'Everyday' });
    });

    it('rejects a group with no name', async () => {
      const res = await request(app)
        .post('/v2/account-groups')
        .set(bearer(token))
        .send({ group: {} });

      expect(res.status).toBe(400);
      expect(actualApi.createAccountGroup).not.toHaveBeenCalled();
    });
  });

  describe('PUT /v2/account-groups/:id', () => {
    it('forwards (id, fields) to updateAccountGroup', async () => {
      const res = await request(app)
        .put(`/v2/account-groups/${GROUP_ID}`)
        .set(bearer(token))
        .send({ fields: { name: 'Savings' } });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(actualApi.updateAccountGroup).toHaveBeenCalledWith(GROUP_ID, { name: 'Savings' });
    });
  });

  describe('DELETE /v2/account-groups/:id', () => {
    it('forwards the id to deleteAccountGroup', async () => {
      const res = await request(app).delete(`/v2/account-groups/${GROUP_ID}`).set(bearer(token));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(actualApi.deleteAccountGroup).toHaveBeenCalledWith(GROUP_ID);
    });
  });
});
