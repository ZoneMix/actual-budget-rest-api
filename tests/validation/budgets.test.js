import {
  SetBudgetSchema,
  BudgetMonthParamsSchema,
  BudgetCategoryParamsSchema,
  BudgetCarryoverSchema,
  BudgetHoldSchema,
  BatchBudgetSchema,
} from '../../src/validation/budgets.js';

describe('budgets schemas', () => {
  const categoryId = '550e8400-e29b-41d4-a716-446655440000';

  it('SetBudgetSchema requires a numeric amount', () => {
    expect(SetBudgetSchema.safeParse({ amount: 100 }).success).toBe(true);
    expect(SetBudgetSchema.safeParse({}).success).toBe(false);
  });

  it('BudgetMonthParamsSchema requires YYYY-MM', () => {
    expect(BudgetMonthParamsSchema.safeParse({ month: '2024-01' }).success).toBe(true);
    expect(BudgetMonthParamsSchema.safeParse({ month: 'january' }).success).toBe(false);
  });

  it('BudgetCategoryParamsSchema requires month + uuid categoryId', () => {
    expect(BudgetCategoryParamsSchema.safeParse({ month: '2024-01', categoryId }).success).toBe(true);
    expect(BudgetCategoryParamsSchema.safeParse({ month: '2024-01', categoryId: 'nope' }).success).toBe(false);
  });

  it('BudgetCarryoverSchema requires a boolean flag', () => {
    expect(BudgetCarryoverSchema.safeParse({ flag: true }).success).toBe(true);
    expect(BudgetCarryoverSchema.safeParse({ flag: 'true' }).success).toBe(false);
  });

  it('BudgetHoldSchema requires a numeric amount', () => {
    expect(BudgetHoldSchema.safeParse({ amount: 50 }).success).toBe(true);
  });

  describe('BatchBudgetSchema', () => {
    it('accepts a setAmount operation', () => {
      const result = BatchBudgetSchema.safeParse({
        operations: [{ type: 'setAmount', month: '2024-01', categoryId, amount: 100 }],
      });
      expect(result.success).toBe(true);
    });

    it('accepts a setCarryover operation', () => {
      const result = BatchBudgetSchema.safeParse({
        operations: [{ type: 'setCarryover', month: '2024-01', categoryId, flag: true }],
      });
      expect(result.success).toBe(true);
    });

    it('accepts a mixed batch of both operation types', () => {
      const result = BatchBudgetSchema.safeParse({
        operations: [
          { type: 'setAmount', month: '2024-01', categoryId, amount: 100 },
          { type: 'setCarryover', month: '2024-01', categoryId, flag: false },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('rejects an unknown operation type (discriminated union)', () => {
      const result = BatchBudgetSchema.safeParse({
        operations: [{ type: 'deleteAmount', month: '2024-01', categoryId }],
      });
      expect(result.success).toBe(false);
    });

    it('rejects a setAmount operation missing amount', () => {
      const result = BatchBudgetSchema.safeParse({
        operations: [{ type: 'setAmount', month: '2024-01', categoryId }],
      });
      expect(result.success).toBe(false);
    });

    it('rejects an empty operations array', () => {
      expect(BatchBudgetSchema.safeParse({ operations: [] }).success).toBe(false);
    });

    it('rejects more than 500 operations', () => {
      const operations = Array.from({ length: 501 }, () => (
        { type: 'setAmount', month: '2024-01', categoryId, amount: 1 }
      ));
      expect(BatchBudgetSchema.safeParse({ operations }).success).toBe(false);
    });
  });
});
