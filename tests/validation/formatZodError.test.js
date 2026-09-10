/**
 * formatZodError: ZodError (or zod-like error) -> [{ field, message, code }].
 */
import { z } from 'zod';
import { formatZodError } from '../../src/validation/errors.js';

describe('formatZodError', () => {
  it('maps a single top-level issue to field/message/code', () => {
    const result = z.object({ name: z.string() }).safeParse({ name: 5 });
    const details = formatZodError(result.error);

    expect(details).toEqual([
      expect.objectContaining({ field: 'name', code: 'invalid_type' }),
    ]);
    expect(typeof details[0].message).toBe('string');
  });

  it('joins a nested path with dots', () => {
    const schema = z.object({ account: z.object({ name: z.string() }) });
    const result = schema.safeParse({ account: { name: 5 } });
    const details = formatZodError(result.error);

    expect(details[0].field).toBe('account.name');
  });

  it('falls back to (root) when the issue path is empty', () => {
    const schema = z.object({ a: z.string() }).refine(() => false, { message: 'root fail' });
    const result = schema.safeParse({ a: 'x' });
    const details = formatZodError(result.error);

    expect(details).toEqual([{ field: '(root)', message: 'root fail', code: expect.any(String) }]);
  });

  it('returns every issue for a multi-field failure', () => {
    const schema = z.object({ a: z.string(), b: z.number() });
    const result = schema.safeParse({ a: 1, b: 'x' });
    const details = formatZodError(result.error);

    expect(details).toHaveLength(2);
    expect(details.map((d) => d.field).sort()).toEqual(['a', 'b']);
  });

  it('handles a zod-like error object that only has `errors` (fallback path)', () => {
    const fakeError = { errors: [{ path: ['x'], message: 'boom', code: 'custom' }] };
    expect(formatZodError(fakeError)).toEqual([{ field: 'x', message: 'boom', code: 'custom' }]);
  });

  it('handles an error with neither issues nor errors', () => {
    const fakeError = { message: 'totally broken' };
    expect(formatZodError(fakeError)).toEqual([
      { field: '(root)', message: 'totally broken', code: 'custom' },
    ]);
  });
});
