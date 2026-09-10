import { QuerySchema } from '../../src/validation/query.js';
import { ACTUAL_QUERY_MAX_RESULTS } from '../../src/config/index.js';

describe('QuerySchema', () => {
  it('accepts a valid query with a filter and select array', () => {
    const result = QuerySchema.safeParse({
      query: {
        table: 'transactions',
        filter: { date: { $gte: '2024-01-01' } },
        select: ['id', 'amount'],
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts select: "*"', () => {
    expect(QuerySchema.safeParse({ query: { table: 'transactions', select: '*' } }).success).toBe(true);
  });

  it('rejects an invalid table name with a helpful message (not the Zod4 errorMap bug)', () => {
    const result = QuerySchema.safeParse({ query: { table: 'invalid_table' } });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toContain('Invalid table name');
    expect(result.error.issues[0].message).toContain('transactions');
  });

  it('accepts orderBy as a string or array of string/record', () => {
    expect(QuerySchema.safeParse({ query: { table: 'accounts', orderBy: 'name' } }).success).toBe(true);
    expect(
      QuerySchema.safeParse({ query: { table: 'accounts', orderBy: [{ name: 'desc' }, 'id'] } }).success
    ).toBe(true);
  });

  it('accepts groupBy as a string or array of strings', () => {
    expect(QuerySchema.safeParse({ query: { table: 'transactions', groupBy: 'category' } }).success).toBe(true);
    expect(
      QuerySchema.safeParse({ query: { table: 'transactions', groupBy: ['category', 'payee'] } }).success
    ).toBe(true);
  });

  it('accepts calculate as a string', () => {
    const result = QuerySchema.safeParse({ query: { table: 'transactions', calculate: 'sum(amount)' } });
    expect(result.success).toBe(true);
  });

  it('rejects select and calculate used together', () => {
    const result = QuerySchema.safeParse({
      query: { table: 'transactions', select: ['id'], calculate: 'sum(amount)' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts options.splits', () => {
    const result = QuerySchema.safeParse({
      query: { table: 'transactions', options: { splits: 'grouped' } },
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown options key', () => {
    const result = QuerySchema.safeParse({
      query: { table: 'transactions', options: { dangerous: true } },
    });
    expect(result.success).toBe(false);
  });

  it('accepts limit/offset within range', () => {
    expect(QuerySchema.safeParse({ query: { table: 'transactions', limit: 100, offset: 0 } }).success).toBe(true);
  });

  it('rejects limit above 10000', () => {
    expect(QuerySchema.safeParse({ query: { table: 'transactions', limit: 10001 } }).success).toBe(false);
  });

  // The schema's ceiling is the same knob the service truncates at, so the two
  // cannot drift apart when an operator retunes ACTUAL_QUERY_MAX_RESULTS.
  it('takes its limit ceiling from ACTUAL_QUERY_MAX_RESULTS', () => {
    expect(QuerySchema.safeParse({
      query: { table: 'transactions', limit: ACTUAL_QUERY_MAX_RESULTS },
    }).success).toBe(true);

    expect(QuerySchema.safeParse({
      query: { table: 'transactions', limit: ACTUAL_QUERY_MAX_RESULTS + 1 },
    }).success).toBe(false);
  });

  it('rejects a negative offset', () => {
    expect(QuerySchema.safeParse({ query: { table: 'transactions', offset: -1 } }).success).toBe(false);
  });
});
