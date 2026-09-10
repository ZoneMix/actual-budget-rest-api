import {
  CreateCategorySchema,
  UpdateCategorySchema,
  DeleteCategoryQuerySchema,
} from '../../src/validation/categories.js';

describe('categories schemas', () => {
  describe('CreateCategorySchema', () => {
    it('accepts name only', () => {
      expect(CreateCategorySchema.safeParse({ category: { name: 'Groceries' } }).success).toBe(true);
    });

    it('accepts group_id and hidden', () => {
      const result = CreateCategorySchema.safeParse({
        category: { name: 'Groceries', group_id: 'g1', hidden: true },
      });
      expect(result.success).toBe(true);
    });

    it('rejects a missing name', () => {
      expect(CreateCategorySchema.safeParse({ category: {} }).success).toBe(false);
    });
  });

  describe('UpdateCategorySchema', () => {
    it('accepts a single field', () => {
      expect(UpdateCategorySchema.safeParse({ fields: { hidden: true } }).success).toBe(true);
    });

    it('accepts group_id on update', () => {
      expect(UpdateCategorySchema.safeParse({ fields: { group_id: 'g2' } }).success).toBe(true);
    });

    it('rejects an empty fields object', () => {
      expect(UpdateCategorySchema.safeParse({ fields: {} }).success).toBe(false);
    });
  });

  describe('DeleteCategoryQuerySchema', () => {
    it('accepts an empty object', () => {
      expect(DeleteCategoryQuerySchema.safeParse({}).success).toBe(true);
    });

    it('accepts a transferCategoryId', () => {
      expect(DeleteCategoryQuerySchema.safeParse({ transferCategoryId: 'cat-2' }).success).toBe(true);
    });
  });
});
