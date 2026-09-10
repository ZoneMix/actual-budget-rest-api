/**
 * /v2/notes routes.
 *
 * `getNote(id)` resolves `NoteEntity | null` (methods.d.ts:98), so a missing
 * note is a 200 with `note: null` rather than a 404 — the id addresses any
 * entity (account, category, payee…), and "this entity has no note" is not a
 * missing resource.
 */

import request from 'supertest';
import { buildTestApp, bearer } from '../helpers/app.js';
import { signTestToken } from '../helpers/token.js';
import actualApi, { __reset } from '../mocks/actual-api.js';

const ENTITY_ID = '9a8b7c6d-2222-4e3f-9a1b-2c3d4e5f6071';

describe('/v2/notes', () => {
  let app;
  let token;

  beforeEach(() => {
    __reset();
    app = buildTestApp();
    token = signTestToken();
  });

  describe('GET /v2/notes/:id', () => {
    it('returns 401 without a token and never reaches the engine', async () => {
      const res = await request(app).get(`/v2/notes/${ENTITY_ID}`);

      expect(res.status).toBe(401);
      expect(actualApi.getNote).not.toHaveBeenCalled();
    });

    it('returns the note the engine holds for the id', async () => {
      const note = { id: ENTITY_ID, note: 'Reconciled through August' };
      actualApi.getNote.mockResolvedValueOnce(note);

      const res = await request(app).get(`/v2/notes/${ENTITY_ID}`).set(bearer(token));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, note });
      expect(actualApi.getNote).toHaveBeenCalledWith(ENTITY_ID);
    });

    it('returns 200 with note: null when the entity has no note', async () => {
      actualApi.getNote.mockResolvedValueOnce(null);

      const res = await request(app).get(`/v2/notes/${ENTITY_ID}`).set(bearer(token));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, note: null });
    });
  });

  describe('PUT /v2/notes/:id', () => {
    it('forwards (id, note) to updateNote', async () => {
      const res = await request(app)
        .put(`/v2/notes/${ENTITY_ID}`)
        .set(bearer(token))
        .send({ note: 'Closed 2026-09-01' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(actualApi.updateNote).toHaveBeenCalledWith(ENTITY_ID, 'Closed 2026-09-01');
    });

    it('accepts an explicit null to clear the note', async () => {
      const res = await request(app)
        .put(`/v2/notes/${ENTITY_ID}`)
        .set(bearer(token))
        .send({ note: null });

      expect(res.status).toBe(200);
      expect(actualApi.updateNote).toHaveBeenCalledWith(ENTITY_ID, null);
    });

    it('rejects a body with no note field', async () => {
      const res = await request(app)
        .put(`/v2/notes/${ENTITY_ID}`)
        .set(bearer(token))
        .send({});

      expect(res.status).toBe(400);
      expect(actualApi.updateNote).not.toHaveBeenCalled();
    });
  });
});
