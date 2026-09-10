/**
 * ActualQL query service.
 *
 * Upstream signatures being pinned here:
 *   aqlQuery(query: Query)  — @types/methods.d.ts:38, dist/index.js:130440
 *   runQuery(query: Query)  — @types/methods.d.ts:37 (deprecated), dist/index.js:130437
 *   q(table)                — re-exported by @types/methods.d.ts:7, dist exports.q
 *
 * Both take a built Query object and call `query.serialize()` themselves, so
 * the plain JSON body has to be mapped onto the builder first. The old code
 * passed `{ query: <plain object> }`, which has no serialize() — every request
 * to POST /v2/query died with a TypeError inside the engine.
 */

import actualApi, { __reset } from '../mocks/actual-api.js';
import { buildQuery, runActualQuery } from '../../src/services/actual/query.js';

const envelope = (data) => ({ data, dependencies: ['transactions'] });

describe('buildQuery', () => {
  it('builds a table-only query with an implicit select *', () => {
    const built = buildQuery({ table: 'transactions' }).serialize();

    expect(built.table).toBe('transactions');
    expect(built.selectExpressions).toEqual(['*']);
    expect(built.filterExpressions).toEqual([]);
    expect(built).toMatchSnapshot();
  });

  it('builds filter + select', () => {
    const built = buildQuery({
      table: 'transactions',
      filter: { date: { $gte: '2026-01-01' } },
      select: ['id', 'amount'],
    }).serialize();

    expect(built.filterExpressions).toEqual([{ date: { $gte: '2026-01-01' } }]);
    expect(built.selectExpressions).toEqual(['id', 'amount']);
    expect(built).toMatchSnapshot();
  });

  it('builds a calculate query and never also selects', () => {
    const built = buildQuery({
      table: 'transactions',
      calculate: { $sum: 'amount' },
    }).serialize();

    expect(built.calculation).toBe(true);
    expect(built.selectExpressions).toEqual([{ result: { $sum: 'amount' } }]);
    expect(built).toMatchSnapshot();
  });

  it('builds orderBy + limit + offset', () => {
    const built = buildQuery({
      table: 'transactions',
      orderBy: [{ date: 'desc' }],
      limit: 25,
      offset: 50,
    }).serialize();

    expect(built.orderExpressions).toEqual([{ date: 'desc' }]);
    expect(built.limit).toBe(25);
    expect(built.offset).toBe(50);
    expect(built).toMatchSnapshot();
  });

  it('applies every entry of an array filter, in order', () => {
    const built = buildQuery({
      table: 'transactions',
      filter: [{ cleared: true }, { amount: { $lt: 0 } }],
    }).serialize();

    expect(built.filterExpressions).toEqual([{ cleared: true }, { amount: { $lt: 0 } }]);
  });

  it('carries groupBy and options through', () => {
    const built = buildQuery({
      table: 'transactions',
      groupBy: ['category'],
      options: { splits: 'grouped' },
    }).serialize();

    expect(built.groupExpressions).toEqual(['category']);
    expect(built.tableOptions).toEqual({ splits: 'grouped' });
  });

  it('leaves limit and offset unset when the spec omits them', () => {
    const built = buildQuery({ table: 'accounts' }).serialize();

    expect(built.limit).toBeNull();
    expect(built.offset).toBeNull();
  });
});

describe('runActualQuery', () => {
  beforeEach(() => {
    __reset();
  });

  it('hands the engine a built query object, not a { query } wrapper', async () => {
    actualApi.aqlQuery.mockResolvedValueOnce(envelope([]));

    await runActualQuery({ table: 'transactions' });

    expect(actualApi.aqlQuery).toHaveBeenCalledTimes(1);
    const [passed] = actualApi.aqlQuery.mock.calls[0];
    expect(typeof passed.serialize).toBe('function');
    expect(passed.serialize().table).toBe('transactions');
    expect(actualApi.runQuery).not.toHaveBeenCalled();
  });

  it('returns result.data and discards dependencies', async () => {
    const rows = [{ id: 't-1' }, { id: 't-2' }];
    actualApi.aqlQuery.mockResolvedValueOnce(envelope(rows));

    await expect(runActualQuery({ table: 'transactions' })).resolves.toBe(rows);
  });

  it('returns a scalar calculate result unchanged', async () => {
    actualApi.aqlQuery.mockResolvedValueOnce(envelope(-12345));

    await expect(runActualQuery({ table: 'transactions', calculate: { $sum: 'amount' } }))
      .resolves.toBe(-12345);
  });

  it('falls back to the deprecated runQuery when aqlQuery is absent', async () => {
    const saved = actualApi.aqlQuery;
    delete actualApi.aqlQuery;
    actualApi.runQuery.mockResolvedValueOnce(envelope([]));

    try {
      await runActualQuery({ table: 'accounts' });
      expect(actualApi.runQuery).toHaveBeenCalledTimes(1);
    } finally {
      actualApi.aqlQuery = saved;
    }
  });

  it('rejects when the engine returns a result with no data envelope', async () => {
    actualApi.aqlQuery.mockResolvedValueOnce(undefined);

    await expect(runActualQuery({ table: 'transactions' })).rejects.toThrow(/unexpected query result/i);
  });
});
