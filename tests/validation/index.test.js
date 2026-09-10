/**
 * The three validation middleware factories: attach the parsed data on
 * success, throw a ValidationError (for errorHandler to render) on failure.
 */
import { z } from 'zod';
import { validateBody, validateParams, validateQuery } from '../../src/validation/index.js';
import { ValidationError } from '../../src/errors/index.js';

const schema = z.object({ name: z.string().min(1) });

describe('validateBody', () => {
  it('attaches req.validatedBody and calls next() on success', () => {
    const req = { body: { name: 'ok' } };
    const next = jest.fn();
    validateBody(schema)(req, {}, next);

    expect(req.validatedBody).toEqual({ name: 'ok' });
    expect(next).toHaveBeenCalledWith();
  });

  it('throws a ValidationError with formatted details on failure', () => {
    const req = { body: {} };
    const next = jest.fn();

    expect(() => validateBody(schema)(req, {}, next)).toThrow(ValidationError);
    expect(next).not.toHaveBeenCalled();

    try {
      validateBody(schema)(req, {}, next);
    } catch (err) {
      expect(err.details).toEqual([
        expect.objectContaining({ field: 'name' }),
      ]);
    }
  });
});

describe('validateParams', () => {
  it('attaches req.validatedParams on success', () => {
    const req = { params: { name: 'ok' } };
    const next = jest.fn();
    validateParams(schema)(req, {}, next);

    expect(req.validatedParams).toEqual({ name: 'ok' });
    expect(next).toHaveBeenCalled();
  });

  it('throws on failure', () => {
    const req = { params: {} };
    expect(() => validateParams(schema)(req, {}, jest.fn())).toThrow(ValidationError);
  });
});

describe('validateQuery', () => {
  it('attaches req.validatedQuery on success', () => {
    const req = { query: { name: 'ok' } };
    const next = jest.fn();
    validateQuery(schema)(req, {}, next);

    expect(req.validatedQuery).toEqual({ name: 'ok' });
    expect(next).toHaveBeenCalled();
  });

  it('throws on failure', () => {
    const req = { query: {} };
    expect(() => validateQuery(schema)(req, {}, jest.fn())).toThrow(ValidationError);
  });
});
