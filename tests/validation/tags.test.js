import { CreateTagSchema, UpdateTagSchema } from '../../src/validation/tags.js';

describe('tags schemas', () => {
  describe('CreateTagSchema', () => {
    it('accepts a tag with only the required tag string', () => {
      expect(CreateTagSchema.safeParse({ tag: { tag: '#groceries' } }).success).toBe(true);
    });

    it('accepts a nullable color and description', () => {
      const result = CreateTagSchema.safeParse({
        tag: { tag: '#groceries', color: null, description: null },
      });
      expect(result.success).toBe(true);
    });

    it('rejects an empty tag string', () => {
      expect(CreateTagSchema.safeParse({ tag: { tag: '' } }).success).toBe(false);
    });
  });

  describe('UpdateTagSchema', () => {
    it('accepts a single field', () => {
      expect(UpdateTagSchema.safeParse({ fields: { color: '#ff0000' } }).success).toBe(true);
    });

    it('rejects an empty fields object', () => {
      expect(UpdateTagSchema.safeParse({ fields: {} }).success).toBe(false);
    });
  });
});
