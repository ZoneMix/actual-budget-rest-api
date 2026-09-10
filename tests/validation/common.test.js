import {
  IDSchema,
  UuidSchema,
  MonthSchema,
  HiddenQuerySchema,
  LookupParamsSchema,
  AccountIdParamsSchema,
  PayeeIdParamsSchema,
} from '../../src/validation/common.js';

describe('common schemas', () => {
  describe('IDSchema', () => {
    it.each([
      ['123', true],
      ['a'.repeat(255), true],
      ['', false],
      ['a'.repeat(256), false],
    ])('id=%p -> success=%p', (id, expected) => {
      expect(IDSchema.safeParse({ id }).success).toBe(expected);
    });

    it('rejects a missing id', () => {
      expect(IDSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('UuidSchema', () => {
    it('accepts a v4 uuid', () => {
      expect(UuidSchema.safeParse('550e8400-e29b-41d4-a716-446655440000').success).toBe(true);
    });

    it('rejects a non-uuid string', () => {
      expect(UuidSchema.safeParse('not-a-uuid').success).toBe(false);
    });
  });

  describe('MonthSchema', () => {
    it.each([
      ['2024-01', true],
      ['2024-13', true], // format-only regex; not calendar-aware, matches prior behaviour
      ['2024-1', false],
      ['24-01', false],
      ['', false],
    ])('month=%p -> success=%p', (month, expected) => {
      expect(MonthSchema.safeParse(month).success).toBe(expected);
    });
  });

  describe('HiddenQuerySchema', () => {
    it('coerces the string "true" to boolean true', () => {
      const result = HiddenQuerySchema.safeParse({ hidden: 'true' });
      expect(result).toMatchObject({ success: true, data: { hidden: true } });
    });

    it('coerces the string "false" to boolean false (not JS Boolean() coercion)', () => {
      const result = HiddenQuerySchema.safeParse({ hidden: 'false' });
      expect(result).toMatchObject({ success: true, data: { hidden: false } });
    });

    it('accepts a missing hidden key', () => {
      expect(HiddenQuerySchema.safeParse({}).success).toBe(true);
    });

    it('rejects a non-boolean-ish string', () => {
      expect(HiddenQuerySchema.safeParse({ hidden: 'yes' }).success).toBe(false);
    });
  });

  describe('LookupParamsSchema', () => {
    it('accepts a non-empty name paired with a known type', () => {
      expect(LookupParamsSchema.safeParse({ type: 'categories', name: 'Groceries' }).success).toBe(true);
    });

    it('rejects an empty name', () => {
      expect(LookupParamsSchema.safeParse({ type: 'categories', name: '' }).success).toBe(false);
    });

    // getIDByName's `type` is a closed union in the SDK signature, so an
    // unlisted table must fail here rather than reach the engine.
    it('rejects a type outside the SDK union', () => {
      expect(LookupParamsSchema.safeParse({ type: 'transactions', name: 'Groceries' }).success).toBe(false);
    });

    it('requires a type', () => {
      expect(LookupParamsSchema.safeParse({ name: 'Groceries' }).success).toBe(false);
    });

    it('accepts every type the SDK union allows', () => {
      ['accounts', 'schedules', 'categories', 'payees'].forEach((type) => {
        expect(LookupParamsSchema.safeParse({ type, name: 'Anything' }).success).toBe(true);
      });
    });
  });

  describe('AccountIdParamsSchema / PayeeIdParamsSchema', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';

    it('AccountIdParamsSchema requires a uuid accountId', () => {
      expect(AccountIdParamsSchema.safeParse({ accountId: uuid }).success).toBe(true);
      expect(AccountIdParamsSchema.safeParse({ accountId: 'nope' }).success).toBe(false);
    });

    it('PayeeIdParamsSchema requires a uuid payeeId', () => {
      expect(PayeeIdParamsSchema.safeParse({ payeeId: uuid }).success).toBe(true);
      expect(PayeeIdParamsSchema.safeParse({ payeeId: 'nope' }).success).toBe(false);
    });
  });
});
