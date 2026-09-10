import { CreateAccountGroupSchema, UpdateAccountGroupSchema } from '../../src/validation/accountGroups.js';

describe('accountGroups schemas', () => {
  describe('CreateAccountGroupSchema', () => {
    it('accepts a valid name', () => {
      expect(CreateAccountGroupSchema.safeParse({ group: { name: 'Investments' } }).success).toBe(true);
    });

    it('rejects a missing name', () => {
      expect(CreateAccountGroupSchema.safeParse({ group: {} }).success).toBe(false);
    });
  });

  describe('UpdateAccountGroupSchema', () => {
    it('accepts a single field', () => {
      expect(UpdateAccountGroupSchema.safeParse({ fields: { name: 'Renamed' } }).success).toBe(true);
    });

    it('rejects an empty fields object', () => {
      expect(UpdateAccountGroupSchema.safeParse({ fields: {} }).success).toBe(false);
    });
  });
});
