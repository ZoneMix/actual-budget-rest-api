/**
 * Query security middleware tests.
 */

import { validateQuery, secureQueryMiddleware, limitQueryResults } from '../../src/middleware/querySecurity.js';
import { ValidationError } from '../../src/errors/index.js';

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

