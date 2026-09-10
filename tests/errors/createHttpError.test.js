/**
 * Regression test for the bug named in the Phase E brief: createHttpError's
 * raw-ZodError branch called `error.errors.map(...)`, which is undefined in
 * Zod 4 and threw a TypeError instead of returning a ValidationError.
 */
import { z } from 'zod';
import { createHttpError, HttpError, ValidationError, InternalServerError } from '../../src/errors/index.js';

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
});
