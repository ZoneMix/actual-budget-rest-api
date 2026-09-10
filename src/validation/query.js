/**
 * ActualQL query schema with security restrictions.
 * Based on: https://actualbudget.org/docs/api/actual-ql/
 * secureQueryMiddleware (src/middleware/querySecurity.js) re-checks the
 * table/filter/select/options shape at runtime and is untouched here.
 */
import { z } from 'zod';
import { QUERY_TABLES, QUERY_SPLIT_MODES } from './constants.js';
import { ACTUAL_QUERY_MAX_RESULTS } from '../config/index.js';

const RecordSchema = z.record(z.string(), z.unknown());

const FilterSchema = z.union([RecordSchema, z.array(RecordSchema)]);
const SelectSchema = z.union([z.literal('*'), z.array(z.string()), z.array(RecordSchema)]);
const OrderBySchema = z.union([z.string(), z.array(z.union([z.string(), RecordSchema]))]);
const GroupBySchema = z.union([z.string(), z.array(z.string())]);
const CalculateSchema = z.union([z.string(), RecordSchema]);

export const QuerySchema = z.object({
  query: z.object({
    // Zod 4 silently ignores the old `errorMap` option — `error` is the
    // replacement for a custom enum message.
    table: z.enum(QUERY_TABLES, {
      error: `Invalid table name. Allowed tables: ${QUERY_TABLES.join(', ')}`,
    }),
    filter: FilterSchema.optional(),
    select: SelectSchema.optional(),
    orderBy: OrderBySchema.optional(),
    groupBy: GroupBySchema.optional(),
    calculate: CalculateSchema.optional(),
    options: z.strictObject({
      splits: z.enum(QUERY_SPLIT_MODES).optional(),
    }).optional(),
    // Same ceiling the service truncates at, so the two cannot drift when an
    // operator retunes ACTUAL_QUERY_MAX_RESULTS.
    limit: z.number().int().min(1).max(ACTUAL_QUERY_MAX_RESULTS).optional(),
    offset: z.number().int().min(0).optional(),
  }).refine(
    (q) => !(q.select !== undefined && q.calculate !== undefined),
    { message: 'select and calculate cannot be used together', path: ['select'] }
  ),
});
