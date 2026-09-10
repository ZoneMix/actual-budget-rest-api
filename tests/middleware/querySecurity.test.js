/**
 * Query security middleware tests.
 */

import { validateQuery, secureQueryMiddleware, limitQueryResults } from '../../src/middleware/querySecurity.js';
import { ValidationError } from '../../src/errors/index.js';
import { ACTUAL_QUERY_MAX_RESULTS, ACTUAL_QUERY_MAX_FILTER_DEPTH } from '../../src/config/index.js';

describe('Query Security', () => {
  describe('validateQuery', () => {
    it('should validate valid query with allowed table', () => {
      expect(() => validateQuery({
        table: 'transactions',
        filter: { date: { $gte: '2024-01-01' } },
        select: ['id', 'amount'],
      })).not.toThrow();
    });

    it('should reject invalid table name', () => {
      expect(() => validateQuery({
        table: 'invalid_table',
      })).toThrow(ValidationError);
    });

    it('should validate query with select *', () => {
      expect(() => validateQuery({
        table: 'accounts',
        select: '*',
      })).not.toThrow();
    });

    it('should validate query with filter', () => {
      expect(() => validateQuery({
        table: 'categories',
        filter: { name: 'Test' },
      })).not.toThrow();
    });

    it('should validate query with $and filter', () => {
      expect(() => validateQuery({
        table: 'transactions',
        filter: {
          $and: [
            { amount: { $gt: 0 } },
            { date: { $gte: '2024-01-01' } },
          ],
        },
      })).not.toThrow();
    });

    it('should validate query with $or filter', () => {
      expect(() => validateQuery({
        table: 'transactions',
        filter: {
          $or: [
            { amount: { $gt: 0 } },
            { cleared: true },
          ],
        },
      })).not.toThrow();
    });

    // QuerySchema's FilterSchema accepts an array of filter expressions, and
    // buildQuery turns each entry into its own .filter() call, so the security
    // layer has to accept the same shape or that branch is unreachable.
    describe('array filters', () => {
      it('accepts an array of filter expressions', () => {
        expect(() => validateQuery({
          table: 'transactions',
          filter: [{ cleared: true }, { amount: { $lt: 0 } }],
        })).not.toThrow();
      });

      it('accepts an empty array', () => {
        expect(() => validateQuery({ table: 'transactions', filter: [] })).not.toThrow();
      });

      it('still rejects a dangerous operator inside an array entry', () => {
        expect(() => validateQuery({
          table: 'transactions',
          filter: [{ cleared: true }, { $exec: 'malicious code' }],
        })).toThrow(ValidationError);
      });

      it('rejects an array longer than the condition-array cap', () => {
        expect(() => validateQuery({
          table: 'transactions',
          filter: Array(51).fill({ cleared: true }),
        })).toThrow(ValidationError);
      });

      it('rejects an array nested inside an array', () => {
        expect(() => validateQuery({
          table: 'transactions',
          filter: [[{ cleared: true }]],
        })).toThrow(ValidationError);
      });

      it('rejects a non-object entry', () => {
        expect(() => validateQuery({
          table: 'transactions',
          filter: [{ cleared: true }, 'nope'],
        })).toThrow(ValidationError);
      });
    });

    it('should reject filter with dangerous operator', () => {
      expect(() => validateQuery({
        table: 'transactions',
        filter: { $exec: 'malicious code' },
      })).toThrow(ValidationError);
    });

    it('should reject filter exceeding max depth', () => {
      // Create a filter that exceeds MAX_FILTER_DEPTH (5)
      // Each $and adds 1 to depth, so we need 6 levels
      const deepFilter = {
        $and: [
          {
            $and: [
              {
                $and: [
                  {
                    $and: [
                      {
                        $and: [
                          {
                            $and: [
                              { test: 'value' },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
      
      expect(() => validateQuery({
        table: 'transactions',
        filter: deepFilter,
      })).toThrow(ValidationError);
    });

    it('should reject $and/$or with non-array value', () => {
      expect(() => validateQuery({
        table: 'transactions',
        filter: { $and: 'not an array' },
      })).toThrow(ValidationError);
    });

    it('should reject $and/$or array exceeding max length', () => {
      const largeArray = Array(51).fill({ test: 'value' });
      expect(() => validateQuery({
        table: 'transactions',
        filter: { $and: largeArray },
      })).toThrow(ValidationError);
    });

    it('should reject select array exceeding max length', () => {
      const largeSelect = Array(101).fill('field');
      expect(() => validateQuery({
        table: 'transactions',
        select: largeSelect,
      })).toThrow(ValidationError);
    });

    it('should reject select field with path traversal', () => {
      expect(() => validateQuery({
        table: 'transactions',
        select: ['../etc/passwd'],
      })).toThrow(ValidationError);
    });

    it('should reject invalid options', () => {
      expect(() => validateQuery({
        table: 'transactions',
        options: { dangerous: true },
      })).toThrow(ValidationError);
    });

    it('should accept valid options', () => {
      expect(() => validateQuery({
        table: 'transactions',
        options: { splits: 'inline' },
      })).not.toThrow();
    });

    // orderBy / groupBy / calculate reach the engine as field expressions just
    // like select does, so they get the same path-traversal check.
    describe('field-expression checks', () => {
      it.each([
        ['orderBy string', { orderBy: '../secrets' }],
        ['orderBy array entry', { orderBy: ['date', '../secrets'] }],
        ['orderBy object key', { orderBy: [{ '../secrets': 'desc' }] }],
        ['orderBy object value', { orderBy: [{ field: 'a/b' }] }],
        ['groupBy string', { groupBy: 'a\\b' }],
        ['groupBy array entry', { groupBy: ['category', '../secrets'] }],
        ['calculate string', { calculate: '../secrets' }],
        ['calculate object key', { calculate: { '../secrets': 'amount' } }],
        ['calculate object value', { calculate: { $sum: '../secrets' } }],
      ])('rejects a traversal sequence in %s', (_label, extra) => {
        expect(() => validateQuery({ table: 'transactions', ...extra })).toThrow(ValidationError);
      });

      it.each([
        ['orderBy string', { orderBy: 'date' }],
        ['orderBy object', { orderBy: [{ date: 'desc' }] }],
        ['groupBy array', { groupBy: ['category', 'payee'] }],
        ['calculate object', { calculate: { $sum: 'amount' } }],
      ])('accepts a clean %s', (_label, extra) => {
        expect(() => validateQuery({ table: 'transactions', ...extra })).not.toThrow();
      });

      it('ignores non-string leaves such as booleans and numbers', () => {
        expect(() => validateQuery({
          table: 'transactions',
          orderBy: [{ date: 'desc', nulls: null }],
          groupBy: 'category',
        })).not.toThrow();
      });
    });
  });

  describe('limitQueryResults', () => {
    it('should return results if under limit', () => {
      const results = Array(100).fill({ id: 1 });
      expect(limitQueryResults(results)).toHaveLength(100);
    });

    it('should truncate results exceeding limit', () => {
      const results = Array(15000).fill({ id: 1 });
      const limited = limitQueryResults(results);
      expect(limited).toHaveLength(10000);
    });

    it('truncates at the configured cap rather than a hardcoded literal', () => {
      const results = Array(ACTUAL_QUERY_MAX_RESULTS + 1).fill({ id: 1 });
      expect(limitQueryResults(results)).toHaveLength(ACTUAL_QUERY_MAX_RESULTS);
    });

    it('returns an at-the-cap result untouched', () => {
      const results = Array(ACTUAL_QUERY_MAX_RESULTS).fill({ id: 1 });
      expect(limitQueryResults(results)).toBe(results);
    });

    it('rejects a filter one level past the configured depth', () => {
      // Nest $and exactly ACTUAL_QUERY_MAX_FILTER_DEPTH + 1 levels deep.
      let filter = { test: 'value' };
      for (let i = 0; i <= ACTUAL_QUERY_MAX_FILTER_DEPTH; i += 1) {
        filter = { $and: [filter] };
      }
      expect(() => validateQuery({ table: 'transactions', filter })).toThrow(ValidationError);
    });

    it('should return non-array results as-is', () => {
      const result = { id: 1, name: 'Test' };
      expect(limitQueryResults(result)).toEqual(result);
    });
  });

  describe('secureQueryMiddleware', () => {
    let req, res, next;

    beforeEach(() => {
      req = {
        id: 'test-request-id',
        user: { user_id: 1 },
        validatedBody: {
          query: {
            table: 'transactions',
            filter: { date: { $gte: '2024-01-01' } },
          },
        },
      };
      res = {};
      next = jest.fn();
    });

    it('should call next for valid query', () => {
      secureQueryMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should throw ValidationError for invalid query', () => {
      req.validatedBody.query.table = 'invalid_table';
      expect(() => secureQueryMiddleware(req, res, next)).toThrow(ValidationError);
    });
  });
});

