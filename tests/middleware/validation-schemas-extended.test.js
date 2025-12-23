/**
 * Extended validation schema tests.
 */

import {
  IDSchema,
  CreateAccountSchema,
  UpdateAccountSchema,
  CloseAccountSchema,
  CreateTransactionSchema,
  UpdateTransactionSchema,
  CreateCategorySchema,
  UpdateCategorySchema,
  CreateCategoryGroupSchema,
  UpdateCategoryGroupSchema,
  CreatePayeeSchema,
  UpdatePayeeSchema,
  LoginSchema,
  LogoutSchema,
  CreateClientSchema,
  UpdateClientSchema,
  ClientIdParamsSchema,
  AccountBalanceQuerySchema,
} from '../../src/middleware/validation-schemas.js';

describe('Extended Validation Schemas', () => {
  describe('CloseAccountSchema', () => {
    it('should validate with optional transferAccountId', () => {
      const result = CloseAccountSchema.safeParse({
        transferAccountId: 'account-123',
      });
      expect(result.success).toBe(true);
    });

    it('should validate with optional transferCategoryId', () => {
      const result = CloseAccountSchema.safeParse({
        transferCategoryId: 'category-123',
      });
      expect(result.success).toBe(true);
    });

    it('should validate with both transfer fields', () => {
      const result = CloseAccountSchema.safeParse({
        transferAccountId: 'account-123',
        transferCategoryId: 'category-123',
      });
      expect(result.success).toBe(true);
    });

    it('should validate with empty object', () => {
      const result = CloseAccountSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('CreateTransactionSchema', () => {
    it('should validate valid transaction', () => {
      const result = CreateTransactionSchema.safeParse({
        transaction: {
          account: 'account-123',
          amount: 1000,
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing account', () => {
      const result = CreateTransactionSchema.safeParse({
        transaction: {
          amount: 1000,
        },
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing amount', () => {
      const result = CreateTransactionSchema.safeParse({
        transaction: {
          account: 'account-123',
        },
      });
      expect(result.success).toBe(false);
    });

    it('should accept optional fields', () => {
      const result = CreateTransactionSchema.safeParse({
        transaction: {
          account: 'account-123',
          amount: 1000,
          date: '2024-01-01',
          payee: 'Test Payee',
          notes: 'Test notes',
          category: 'category-123',
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('UpdateTransactionSchema', () => {
    it('should validate with at least one field', () => {
      const result = UpdateTransactionSchema.safeParse({
        fields: { amount: 2000 },
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty fields', () => {
      const result = UpdateTransactionSchema.safeParse({
        fields: {},
      });
      expect(result.success).toBe(false);
    });
  });

  describe('CreateCategorySchema', () => {
    it('should validate valid category', () => {
      const result = CreateCategorySchema.safeParse({
        category: {
          name: 'Test Category',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should accept optional group_id', () => {
      const result = CreateCategorySchema.safeParse({
        category: {
          name: 'Test Category',
          group_id: 'group-123',
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('CreateCategoryGroupSchema', () => {
    it('should validate valid category group', () => {
      const result = CreateCategoryGroupSchema.safeParse({
        group: {
          name: 'Test Group',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should accept optional is_income', () => {
      const result = CreateCategoryGroupSchema.safeParse({
        group: {
          name: 'Test Group',
          is_income: true,
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('CreatePayeeSchema', () => {
    it('should validate valid payee', () => {
      const result = CreatePayeeSchema.safeParse({
        payee: {
          name: 'Test Payee',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing name', () => {
      const result = CreatePayeeSchema.safeParse({
        payee: {},
      });
      expect(result.success).toBe(false);
    });
  });

  describe('LoginSchema', () => {
    it('should validate username and password', () => {
      const result = LoginSchema.safeParse({
        username: 'testuser',
        password: 'password123',
      });
      expect(result.success).toBe(true);
    });

    it('should validate refresh_token', () => {
      const result = LoginSchema.safeParse({
        refresh_token: 'refresh-token-123',
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing credentials', () => {
      const result = LoginSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject username without password', () => {
      const result = LoginSchema.safeParse({
        username: 'testuser',
      });
      expect(result.success).toBe(false);
    });

    it('should validate username format', () => {
      const result = LoginSchema.safeParse({
        username: 'test-user_123',
        password: 'password',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid username format', () => {
      const result = LoginSchema.safeParse({
        username: 'test user!',
        password: 'password',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('LogoutSchema', () => {
    it('should validate with optional refresh_token', () => {
      const result = LogoutSchema.safeParse({
        refresh_token: 'refresh-token-123',
      });
      expect(result.success).toBe(true);
    });

    it('should validate with empty object', () => {
      const result = LogoutSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('CreateClientSchema', () => {
    it('should validate valid client', () => {
      const result = CreateClientSchema.safeParse({
        client_id: 'test-client',
        allowed_scopes: 'api',
      });
      expect(result.success).toBe(true);
    });

    it('should use default allowed_scopes', () => {
      const result = CreateClientSchema.safeParse({
        client_id: 'test-client',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed_scopes).toBe('api');
      }
    });

    it('should accept optional client_secret', () => {
      const result = CreateClientSchema.safeParse({
        client_id: 'test-client',
        client_secret: 'secret-32-characters-long-minimum',
      });
      expect(result.success).toBe(true);
    });

    it('should reject client_secret that is too short', () => {
      const result = CreateClientSchema.safeParse({
        client_id: 'test-client',
        client_secret: 'short',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('UpdateClientSchema', () => {
    it('should validate with at least one field', () => {
      const result = UpdateClientSchema.safeParse({
        client_secret: 'new-secret-32-characters-long-minimum',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty object', () => {
      const result = UpdateClientSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('ClientIdParamsSchema', () => {
    it('should validate valid client ID', () => {
      const result = ClientIdParamsSchema.safeParse({
        clientId: 'test-client-123',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty client ID', () => {
      const result = ClientIdParamsSchema.safeParse({
        clientId: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('AccountBalanceQuerySchema', () => {
    it('should validate with optional cutoff date', () => {
      const result = AccountBalanceQuerySchema.safeParse({
        cutoff: '2024-01-01T00:00:00Z',
      });
      expect(result.success).toBe(true);
    });

    it('should validate with empty object', () => {
      const result = AccountBalanceQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should reject invalid date format', () => {
      const result = AccountBalanceQuerySchema.safeParse({
        cutoff: 'invalid-date',
      });
      expect(result.success).toBe(false);
    });
  });
});

