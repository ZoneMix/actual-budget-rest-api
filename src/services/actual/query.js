/**
 * Ad-hoc ActualQL queries against the Actual engine.
 *
 * `aqlQuery` / `runQuery` take a BUILT query object and call `.serialize()` on
 * it themselves (@actual-app/api dist/index.js:130437-130441). Handing them the
 * plain JSON body — as `runQuery({ query })` used to — threw a TypeError inside
 * the engine, so this endpoint never worked. The validated JSON is mapped onto
 * the `q()` builder here instead.
 *
 * `q` is a named export of @actual-app/api (@types/methods.d.ts:7); the engine
 * mock exports it under the same name.
 */

import { q } from '@actual-app/api';
import logger from '../../logging/logger.js';
import { ACTUAL_QUERY_MAX_RESULTS } from '../../config/index.js';
import { runWithApi } from './runner.js';

// `q(...).select()` with no argument selects nothing; ActualQL's own default
// for a bare table query is every column.
const DEFAULT_SELECT = '*';

/**
 * Normalises the `filter` value to a list of expressions.
 * The schema accepts a single object or an array of them; the builder takes
 * one expression per `.filter()` call.
 */
const filterExpressions = (filter) => {
  if (filter === undefined || filter === null) return [];
  return Array.isArray(filter) ? filter : [filter];
};

/**
 * Resolves the LIMIT clause.
 *
 * The engine emits LIMIT and OFFSET independently
 * (dist/index.js:14011-14012, :14857-14858, :14879) and SQLite rejects an
 * OFFSET with no LIMIT before it — `near "5": syntax error`. An offset on its
 * own therefore has to imply one, and the result cap is the only bound that is
 * already the caller's ceiling anyway.
 */
const effectiveLimit = (limit, offset) => {
  if (limit !== undefined) return limit;
  return offset !== undefined ? ACTUAL_QUERY_MAX_RESULTS : undefined;
};

/**
 * Maps a validated query spec onto the ActualQL builder.
 *
 * The call order is fixed: table → filters → select|calculate → groupBy →
 * orderBy → options → limit → offset. `select` and `calculate` are mutually
 * exclusive (QuerySchema rejects both together); `calculate` wins here so a
 * schema change can never produce a query that both selects and calculates.
 * An `offset` with no `limit` gets the result cap as its limit — see
 * effectiveLimit above.
 *
 * Every builder method returns a NEW builder, so nothing is mutated.
 *
 * @param {object} spec - validated body from QuerySchema
 * @returns {object} an ActualQL query ready to hand to the engine
 */
export const buildQuery = (spec) => {
  const { table, filter, select, calculate, groupBy, orderBy, options, limit, offset } = spec;

  const withFilters = filterExpressions(filter).reduce(
    (query, expression) => query.filter(expression),
    q(table)
  );

  const withProjection = calculate !== undefined
    ? withFilters.calculate(calculate)
    : withFilters.select(select ?? DEFAULT_SELECT);

  const withGroup = groupBy !== undefined ? withProjection.groupBy(groupBy) : withProjection;
  const withOrder = orderBy !== undefined ? withGroup.orderBy(orderBy) : withGroup;
  const withOptions = options !== undefined ? withOrder.options(options) : withOrder;

  const boundedLimit = effectiveLimit(limit, offset);
  const withLimit = boundedLimit !== undefined ? withOptions.limit(boundedLimit) : withOptions;

  return offset !== undefined ? withLimit.offset(offset) : withLimit;
};

/**
 * Runs a validated query spec and returns just the rows.
 *
 * The engine answers `{ data, dependencies }`; `dependencies` is an internal
 * cache-invalidation hint of no use to an HTTP caller, so it is dropped. A
 * result without a `data` envelope means the engine broke its own contract and
 * is surfaced as an error rather than silently returned as undefined.
 *
 * `runQuery` is the deprecated alias kept only for an engine build that
 * predates `aqlQuery` (@types/methods.d.ts:34-38).
 */
export const runActualQuery = async (spec) => {
  return runWithApi(
    'runActualQuery',
    async (apiInstance) => {
      logger.debug('[Actual] Running query', { table: spec.table });

      const query = buildQuery(spec);
      const execute = apiInstance.aqlQuery ?? apiInstance.runQuery;
      const result = await execute.call(apiInstance, query);

      if (!result || typeof result !== 'object' || !('data' in result)) {
        throw new Error(
          `Actual returned an unexpected query result for table ${spec.table}: expected { data, dependencies }`
        );
      }

      logger.info('[Actual] runActualQuery completed', {
        table: spec.table,
        resultCount: Array.isArray(result.data) ? result.data.length : 'non-array',
      });

      return result.data;
    },
    { mode: 'read' }
  );
};
