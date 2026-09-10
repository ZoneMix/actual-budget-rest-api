import {
  CreateCategoryGroupSchema,
  UpdateCategoryGroupSchema,
  DeleteCategoryQuerySchema,
} from '../../src/validation/categoryGroups.js';

describe('categoryGroups schemas', () => {
  describe('CreateCategoryGroupSchema', () => {
    it('accepts name only', () => {
      expect(CreateCategoryGroupSchema.safeParse({ group: { name: 'Bills' } }).success).toBe(true);
    });

    it('accepts is_income and hidden', () => {
      const result = CreateCategoryGroupSchema.safeParse({
        group: { name: 'Income', is_income: true, hidden: false },
      });
      expect(result.success).toBe(true);
    });

    it('rejects a missing name', () => {
      expect(CreateCategoryGroupSchema.safeParse({ group: {} }).success).toBe(false);
    });
  });

  describe('UpdateCategoryGroupSchema', () => {
    it('accepts a single field', () => {
      expect(UpdateCategoryGroupSchema.safeParse({ fields: { hidden: true } }).success).toBe(true);
    });

    it('rejects an empty fields object', () => {
      expect(UpdateCategoryGroupSchema.safeParse({ fields: {} }).success).toBe(false);
    });
  });

  describe('DeleteCategoryQuerySchema (shared with categories)', () => {
    it('is re-exported and usable for category-group deletes too', () => {
      expect(DeleteCategoryQuerySchema.safeParse({ transferCategoryId: 'cat-3' }).success).toBe(true);
    });
  });
});
