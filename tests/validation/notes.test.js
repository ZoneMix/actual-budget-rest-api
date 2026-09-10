import { UpdateNoteSchema } from '../../src/validation/notes.js';

describe('UpdateNoteSchema', () => {
  it('accepts a string note', () => {
    expect(UpdateNoteSchema.safeParse({ note: 'hello' }).success).toBe(true);
  });

  it('accepts a null note (clearing it)', () => {
    expect(UpdateNoteSchema.safeParse({ note: null }).success).toBe(true);
  });

  it('rejects a missing note key', () => {
    expect(UpdateNoteSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a note over 5000 chars', () => {
    expect(UpdateNoteSchema.safeParse({ note: 'x'.repeat(5001) }).success).toBe(false);
  });
});
