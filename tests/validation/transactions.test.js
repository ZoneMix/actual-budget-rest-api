import {
  AccountTransactionSchema,
  CreateTransactionSchema,
  UpdateTransactionSchema,
  TransactionsAddSchema,
  ImportOptsSchema,
  TransactionsImportSchema,
} from '../../src/validation/transactions.js';

describe('transactions schemas', () => {
  describe('AccountTransactionSchema', () => {
    it('accepts the minimal transaction (amount only)', () => {
      expect(AccountTransactionSchema.safeParse({ amount: 1000 }).success).toBe(true);
    });

    it('rejects a missing amount', () => {
      expect(AccountTransactionSchema.safeParse({}).success).toBe(false);
    });

    it('accepts a full transaction with every optional field', () => {
      const result = AccountTransactionSchema.safeParse({
        amount: 1000,
        date: '2024-01-01',
        payee: 'p1',
        payee_name: 'Store',
        imported_payee: 'STORE #123',
        imported_id: 'ext-1',
        notes: 'note',
        category: null,
        cleared: true,
        reconciled: false,
        transfer_id: null,
        starting_balance_flag: false,
        subtransactions: [{ amount: 500, category: 'cat-1', notes: 'split', payee: 'p1' }],
      });
      expect(result.success).toBe(true);
    });

    it('rejects a malformed date', () => {
      expect(AccountTransactionSchema.safeParse({ amount: 1, date: '01/01/2024' }).success).toBe(false);
    });

    it('rejects notes over 1000 chars', () => {
      expect(AccountTransactionSchema.safeParse({ amount: 1, notes: 'x'.repeat(1001) }).success).toBe(false);
    });

    it('rejects a subtransaction missing amount', () => {
      const result = AccountTransactionSchema.safeParse({
        amount: 1000,
        subtransactions: [{ category: 'cat-1' }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('CreateTransactionSchema', () => {
    it('requires account and amount', () => {
      expect(CreateTransactionSchema.safeParse({ transaction: { amount: 1000 } }).success).toBe(false);
      expect(CreateTransactionSchema.safeParse({ transaction: { account: 'a1' } }).success).toBe(false);
      expect(
        CreateTransactionSchema.safeParse({ transaction: { account: 'a1', amount: 1000 } }).success
      ).toBe(true);
    });
  });

  describe('UpdateTransactionSchema', () => {
    it('accepts a single field', () => {
      expect(UpdateTransactionSchema.safeParse({ fields: { amount: 2000 } }).success).toBe(true);
    });

    it('rejects an empty fields object', () => {
      expect(UpdateTransactionSchema.safeParse({ fields: {} }).success).toBe(false);
    });
  });

  describe('TransactionsAddSchema', () => {
    it('defaults runTransfers and learnCategories to false', () => {
      const result = TransactionsAddSchema.safeParse({ transactions: [{ amount: 1 }] });
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ runTransfers: false, learnCategories: false });
    });

    it('rejects an empty transactions array', () => {
      expect(TransactionsAddSchema.safeParse({ transactions: [] }).success).toBe(false);
    });
  });

  describe('ImportOptsSchema', () => {
    it('accepts an empty object (all optional)', () => {
      expect(ImportOptsSchema.safeParse({}).success).toBe(true);
    });

    it('accepts a valid payeeNameNormalization', () => {
      expect(ImportOptsSchema.safeParse({ payeeNameNormalization: 'title-case' }).success).toBe(true);
    });

    it('rejects an invalid payeeNameNormalization', () => {
      expect(ImportOptsSchema.safeParse({ payeeNameNormalization: 'upper-case' }).success).toBe(false);
    });
  });

  describe('TransactionsImportSchema', () => {
    it('accepts transactions with opts', () => {
      const result = TransactionsImportSchema.safeParse({
        transactions: [{ amount: 1 }],
        opts: { dryRun: true },
      });
      expect(result.success).toBe(true);
    });

    it('rejects an empty transactions array', () => {
      expect(TransactionsImportSchema.safeParse({ transactions: [] }).success).toBe(false);
    });

    it('opts is optional', () => {
      expect(TransactionsImportSchema.safeParse({ transactions: [{ amount: 1 }] }).success).toBe(true);
    });
  });
});
