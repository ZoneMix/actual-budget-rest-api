import {
  CreateAccountSchema,
  UpdateAccountSchema,
  CloseAccountSchema,
  AccountBalanceQuerySchema,
} from '../../src/validation/accounts.js';

describe('accounts schemas', () => {
  describe('CreateAccountSchema', () => {
    it('accepts the minimal valid account', () => {
      const result = CreateAccountSchema.safeParse({ account: { name: 'Checking' } });
      expect(result.success).toBe(true);
    });

    it('rejects a missing name', () => {
      expect(CreateAccountSchema.safeParse({ account: {} }).success).toBe(false);
    });

    it('has no "type" field (not a real API field) — unknown keys are stripped, not rejected', () => {
      const result = CreateAccountSchema.safeParse({ account: { name: 'Checking', type: 'checking' } });
      expect(result.success).toBe(true);
      expect(result.data.account).not.toHaveProperty('type');
    });

    it('normalises offBudget (alias) into offbudget and drops offBudget', () => {
      const result = CreateAccountSchema.safeParse({ account: { name: 'Checking', offBudget: true } });
      expect(result.success).toBe(true);
      expect(result.data.account).toEqual({ name: 'Checking', offbudget: true });
    });

    it('accepts offbudget directly (no alias involved)', () => {
      const result = CreateAccountSchema.safeParse({ account: { name: 'Checking', offbudget: true } });
      expect(result.success).toBe(true);
      expect(result.data.account.offbudget).toBe(true);
    });

    it('accepts closed and a nullable account_group_id', () => {
      const result = CreateAccountSchema.safeParse({
        account: { name: 'Checking', closed: true, account_group_id: null },
      });
      expect(result.success).toBe(true);
    });

    it('accepts an optional initialBalance', () => {
      expect(CreateAccountSchema.safeParse({ account: { name: 'A' }, initialBalance: 500 }).success).toBe(true);
    });

    it('passes the exact { name } shape through when only name is given (route contract)', () => {
      const result = CreateAccountSchema.safeParse({ account: { name: 'Test' }, initialBalance: 100 });
      expect(result.data.account).toEqual({ name: 'Test' });
      expect(result.data.initialBalance).toBe(100);
    });
  });

  describe('UpdateAccountSchema', () => {
    it('accepts a single updated field', () => {
      expect(UpdateAccountSchema.safeParse({ fields: { name: 'New name' } }).success).toBe(true);
    });

    it('rejects an empty fields object', () => {
      expect(UpdateAccountSchema.safeParse({ fields: {} }).success).toBe(false);
    });

    it('normalises offBudget alias on update too', () => {
      const result = UpdateAccountSchema.safeParse({ fields: { offBudget: false } });
      expect(result.success).toBe(true);
      expect(result.data.fields).toEqual({ offbudget: false });
    });
  });

  describe('CloseAccountSchema', () => {
    it('accepts an empty object (both transfer targets optional)', () => {
      expect(CloseAccountSchema.safeParse({}).success).toBe(true);
    });

    it('accepts both transfer ids', () => {
      const result = CloseAccountSchema.safeParse({
        transferAccountId: 'acc-1',
        transferCategoryId: 'cat-1',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('AccountBalanceQuerySchema', () => {
    it('accepts an empty object', () => {
      expect(AccountBalanceQuerySchema.safeParse({}).success).toBe(true);
    });

    it('accepts an ISO datetime cutoff', () => {
      expect(AccountBalanceQuerySchema.safeParse({ cutoff: '2024-01-01T00:00:00Z' }).success).toBe(true);
    });

    it('rejects a non-ISO cutoff', () => {
      expect(AccountBalanceQuerySchema.safeParse({ cutoff: 'invalid-date' }).success).toBe(false);
    });
  });
});
