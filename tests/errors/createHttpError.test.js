/**
 * Regression test for the bug named in the Phase E brief: createHttpError's
 * raw-ZodError branch called `error.errors.map(...)`, which is undefined in
 * Zod 4 and threw a TypeError instead of returning a ValidationError.
 */
import { z } from 'zod';
import {
  createHttpError,
  HttpError,
  ValidationError,
  EngineError,
  InternalServerError,
} from '../../src/errors/index.js';

describe('createHttpError', () => {
  it('returns an HttpError instance unchanged', () => {
    const original = new ValidationError('already an HttpError');
    expect(createHttpError(original)).toBe(original);
  });

  it('converts a raw ZodError into a ValidationError without throwing', () => {
    const zodError = z.object({ name: z.string() }).safeParse({ name: 5 }).error;

    expect(() => createHttpError(zodError)).not.toThrow();

    const result = createHttpError(zodError);
    expect(result).toBeInstanceOf(ValidationError);
    expect(result.status).toBe(400);
    expect(result.code).toBe('VALIDATION_ERROR');
    expect(result.details).toEqual([
      expect.objectContaining({ field: 'name', code: 'invalid_type' }),
    ]);
  });

  it('preserves every issue for a multi-field ZodError', () => {
    const zodError = z.object({ a: z.string(), b: z.number() }).safeParse({ a: 1, b: 'x' }).error;
    const result = createHttpError(zodError);

    expect(result.details).toHaveLength(2);
  });

  it('wraps an error carrying a status property as an HttpError', () => {
    const err = Object.assign(new Error('nope'), { status: 404, details: { id: 1 } });
    const result = createHttpError(err);

    expect(result).toBeInstanceOf(HttpError);
    expect(result.status).toBe(404);
  });

  it('defaults an unrecognised error to InternalServerError', () => {
    const result = createHttpError(new Error('boom'));
    expect(result).toBeInstanceOf(InternalServerError);
    expect(result.status).toBe(500);
  });

  // The engine rejects a bad request by throwing APIError(msg, meta), which is
  // a plain OBJECT — `{ type: 'APIError', message, meta }`, not an Error
  // subclass (see `function APIError(` in @actual-app/api/dist/index.js).
  // runHandler does not wrap it, so it arrives here verbatim: no `instanceof
  // Error`, no `status`, no `stack`. It therefore fell through to
  // InternalServerError, and a caller who omitted transferAccountId on a
  // funded account got a 500 for what is plainly a 400.
  describe('engine APIError', () => {
    const apiError = (message, meta) => ({ type: 'APIError', message, meta });

    it('maps an engine APIError to a 400 EngineError carrying the engine message', () => {
      const result = createHttpError(
        apiError('balance is non-zero: transferAccountId is required')
      );

      expect(result).toBeInstanceOf(EngineError);
      expect(result.status).toBe(400);
      expect(result.code).toBe('ENGINE_ERROR');
      expect(result.message).toBe('balance is non-zero: transferAccountId is required');
    });

    it('keeps the engine meta as error details when present', () => {
      const result = createHttpError(apiError('no such column', { column: 'nope' }));

      expect(result.details).toEqual({ column: 'nope' });
    });

    it('omits details when the engine sends no meta', () => {
      expect(createHttpError(apiError('No budget file is open')).details).toBeNull();
    });

    it('still describes an APIError with no message', () => {
      const result = createHttpError({ type: 'APIError' });

      expect(result).toBeInstanceOf(EngineError);
      expect(result.message).toBe('The budget engine rejected the request');
    });

    it('does not treat a generic Error as an engine error', () => {
      const result = createHttpError(new Error('boom'));

      expect(result).not.toBeInstanceOf(EngineError);
      expect(result.status).toBe(500);
    });

    it('does not treat an unrelated typed object as an engine error', () => {
      const result = createHttpError({ type: 'RuleError', message: 'nope' });

      expect(result).toBeInstanceOf(InternalServerError);
      expect(result.status).toBe(500);
    });
  });
});
