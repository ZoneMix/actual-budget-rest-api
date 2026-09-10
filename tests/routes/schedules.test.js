/**
 * /v2/schedules routes.
 */

import request from 'supertest';
import { buildTestApp, bearer } from '../helpers/app.js';
import { signTestToken } from '../helpers/token.js';
import actualApi, { __reset } from '../mocks/actual-api.js';

describe('/v2/schedules', () => {
  let app;
  let token;

  beforeEach(() => {
    __reset();
    app = buildTestApp();
    token = signTestToken();
  });

  describe('POST /v2/schedules', () => {
    it('forwards the bare schedule to the engine', async () => {
      actualApi.createSchedule.mockResolvedValueOnce('sch-new');

      const res = await request(app)
        .post('/v2/schedules')
        .set(bearer(token))
        .send({ schedule: { name: 'Rent', date: '2026-02-01' } });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ success: true, id: 'sch-new' });
      expect(actualApi.createSchedule).toHaveBeenCalledWith({
        name: 'Rent',
        date: '2026-02-01',
        amountOp: 'is',
      });
    });

    it('normalises the legacy _date alias before the engine sees it', async () => {
      await request(app)
        .post('/v2/schedules')
        .set(bearer(token))
        .send({ schedule: { name: 'Rent', _date: '2026-03-01' } });

      expect(actualApi.createSchedule).toHaveBeenCalledWith({
        name: 'Rent',
        date: '2026-03-01',
        amountOp: 'is',
      });
    });
  });

  describe('PUT /v2/schedules/:id', () => {
    it('reads resetNextDate=true off the query string', async () => {
      const res = await request(app)
        .put('/v2/schedules/sch-1?resetNextDate=true')
        .set(bearer(token))
        .send({ fields: { name: 'Rent (updated)' } });

      expect(res.status).toBe(200);
      expect(actualApi.updateSchedule).toHaveBeenCalledWith('sch-1', { name: 'Rent (updated)' }, true);
    });

    it('reads resetNextDate=false without treating the string as truthy', async () => {
      await request(app)
        .put('/v2/schedules/sch-1?resetNextDate=false')
        .set(bearer(token))
        .send({ fields: { name: 'Rent' } });

      expect(actualApi.updateSchedule).toHaveBeenCalledWith('sch-1', { name: 'Rent' }, false);
    });

    it('leaves the flag undefined when the query string omits it', async () => {
      await request(app)
        .put('/v2/schedules/sch-1')
        .set(bearer(token))
        .send({ fields: { name: 'Rent' } });

      expect(actualApi.updateSchedule).toHaveBeenCalledWith('sch-1', { name: 'Rent' }, undefined);
    });

    it('rejects a non-boolean resetNextDate', async () => {
      const res = await request(app)
        .put('/v2/schedules/sch-1?resetNextDate=yes')
        .set(bearer(token))
        .send({ fields: { name: 'Rent' } });

      expect(res.status).toBe(400);
      expect(actualApi.updateSchedule).not.toHaveBeenCalled();
    });
  });
});
