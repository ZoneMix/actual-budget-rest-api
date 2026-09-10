/**
 * Notes on any Actual entity.
 *
 * The path id is the annotated entity's id (account, category, payee,
 * schedule…), not a note id — the engine stores at most one note per entity.
 * An entity with no note is a 200 with `note: null`, not a 404: the entity
 * exists, it simply has nothing written on it.
 *
 * The two directions are NOT symmetric, which is easy to get wrong:
 * GET responds with the engine's NoteEntity, an OBJECT `{ id, note }` (or
 * null), because `getNote()` returns the row. PUT takes the note TEXT as a
 * bare string in `{ note }`, because `updateNote(id, note)` takes the text.
 * A client that round-trips the GET body straight back into the PUT will send
 * an object where a string is required and get a 400.
 */
import express from 'express';
import { authenticateJWT } from '../auth/jwt.js';
import { requireScopeByMethod } from '../auth/permissions.js';
import { noteGet, noteUpdate } from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { standardBodyParser } from '../middleware/bodyParser.js';
import { validateBody, validateParams } from '../middleware/validation-schemas.js';
import { IDSchema, UpdateNoteSchema } from '../middleware/validation-schemas.js';
import { standardWriteLimiter } from '../middleware/rateLimiters.js';
import { sendSuccess } from '../middleware/responseHelpers.js';

const router = express.Router();
router.use(authenticateJWT, requireScopeByMethod());
router.use(standardBodyParser);

router.get(
  '/:id',
  validateParams(IDSchema),
  asyncHandler(async (req, res) => {
    const note = await noteGet(req.validatedParams.id);
    sendSuccess(res, { note });
  })
);

router.put(
  '/:id',
  standardWriteLimiter,
  validateParams(IDSchema),
  validateBody(UpdateNoteSchema),
  asyncHandler(async (req, res) => {
    const { note } = req.validatedBody;
    await noteUpdate(req.validatedParams.id, note);
    sendSuccess(res);
  })
);

export default router;
