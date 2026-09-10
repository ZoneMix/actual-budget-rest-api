import { CreatePayeeSchema, UpdatePayeeSchema, MergePayeesSchema } from '../../src/validation/payees.js';

describe('payees schemas', () => {
  describe('CreatePayeeSchema', () => {
    it('accepts a valid payee', () => {
      expect(CreatePayeeSchema.safeParse({ payee: { name: 'Store' } }).success).toBe(true);
    });

    it('rejects a missing name', () => {
      expect(CreatePayeeSchema.safeParse({ payee: {} }).success).toBe(false);
    });
  });

  describe('UpdatePayeeSchema', () => {
    it('accepts a single field', () => {
      expect(UpdatePayeeSchema.safeParse({ fields: { name: 'New name' } }).success).toBe(true);
    });

    it('rejects an empty fields object', () => {
      expect(UpdatePayeeSchema.safeParse({ fields: {} }).success).toBe(false);
    });
  });

  describe('MergePayeesSchema', () => {
    const uuid1 = '550e8400-e29b-41d4-a716-446655440000';
    const uuid2 = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

    it('accepts a target and at least one merge id', () => {
      const result = MergePayeesSchema.safeParse({ targetId: uuid1, mergeIds: [uuid2] });
      expect(result.success).toBe(true);
    });

    it('rejects an empty mergeIds array', () => {
      expect(MergePayeesSchema.safeParse({ targetId: uuid1, mergeIds: [] }).success).toBe(false);
    });

    it('rejects a non-uuid targetId', () => {
      expect(MergePayeesSchema.safeParse({ targetId: 'nope', mergeIds: [uuid2] }).success).toBe(false);
    });
  });
});
