import { CreateClientSchema, UpdateClientSchema, ClientIdParamsSchema } from '../../src/validation/admin.js';

describe('admin schemas', () => {
  describe('CreateClientSchema', () => {
    it('accepts a client_id alone and defaults allowed_scopes to ["api"]', () => {
      const result = CreateClientSchema.safeParse({ client_id: 'c1' });
      expect(result.success).toBe(true);
      expect(result.data.allowed_scopes).toEqual(['api']);
    });

    it('splits a comma-separated scopes string into an array', () => {
      const result = CreateClientSchema.safeParse({ client_id: 'c1', allowed_scopes: 'read, write' });
      expect(result.success).toBe(true);
      expect(result.data.allowed_scopes).toEqual(['read', 'write']);
    });

    it('accepts an already-array scopes value', () => {
      const result = CreateClientSchema.safeParse({ client_id: 'c1', allowed_scopes: ['admin'] });
      expect(result.success).toBe(true);
      expect(result.data.allowed_scopes).toEqual(['admin']);
    });

    it('rejects a scope outside SCOPES', () => {
      const result = CreateClientSchema.safeParse({ client_id: 'c1', allowed_scopes: 'superadmin' });
      expect(result.success).toBe(false);
    });

    it('rejects a client_secret shorter than 32 chars', () => {
      expect(CreateClientSchema.safeParse({ client_id: 'c1', client_secret: 'short' }).success).toBe(false);
    });
  });

  describe('UpdateClientSchema', () => {
    it('accepts a single field', () => {
      const result = UpdateClientSchema.safeParse({ client_secret: 'x'.repeat(32) });
      expect(result.success).toBe(true);
    });

    it('rejects an empty object', () => {
      expect(UpdateClientSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('ClientIdParamsSchema', () => {
    it('accepts a non-empty clientId', () => {
      expect(ClientIdParamsSchema.safeParse({ clientId: 'c1' }).success).toBe(true);
    });

    it('rejects an empty clientId', () => {
      expect(ClientIdParamsSchema.safeParse({ clientId: '' }).success).toBe(false);
    });
  });
});
