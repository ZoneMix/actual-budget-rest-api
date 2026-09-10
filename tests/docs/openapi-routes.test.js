/**
 * OpenAPI drift guard.
 *
 * The spec is hand-maintained YAML that nothing else checks against the code,
 * so it has drifted before: routes shipped undocumented and documented paths
 * outlived the handlers behind them. This suite makes that a failing test.
 *
 * It compares two independently-derived sets:
 *   - the routes the assembled Express app actually serves, read out of the
 *     router stacks of the real `createApp()`;
 *   - the operations in the dereferenced OpenAPI document.
 *
 * Express 5 does not keep the mount path on a router Layer (it compiles the
 * path straight into an opaque matcher closure), so the prefixes are recorded
 * as they are declared: `Router.prototype.use` is wrapped for the duration of
 * the import, which catches both `app.use('/v2/x', router)` — Express routes
 * application-level mounts through the same method — and the nested mount
 * `src/routes/accounts.js` performs at module load. That is why the app is
 * imported dynamically here rather than at the top of the file.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';
import SwaggerParser from '@apidevtools/swagger-parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = path.join(__dirname, '../../src/docs/openapi.yml');

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

/** The guard's remit: the versioned API surface. */
const isV2 = (entry) => {
  const routePath = entry.slice(entry.indexOf(' ') + 1);
  return routePath === '/v2' || routePath.startsWith('/v2/');
};

/** `/v2/accounts` + `/:id/close` → `/v2/accounts/:id/close`, `'' + '/'` → `/`. */
const joinPath = (prefix, segment) => {
  const head = prefix === '/' ? '' : prefix;
  const tail = segment === '/' ? '' : segment;
  return `${head}${tail}` || '/';
};

/** Express `:param` → OpenAPI `{param}`. */
const toOpenApiPath = (routePath) => routePath.replace(/:([A-Za-z0-9_]+)/g, '{$1}');

/**
 * Walks a router stack, descending into mounted sub-routers.
 * An unrecorded mount is thrown rather than skipped: silently dropping a
 * subtree would hide exactly the drift this suite exists to catch.
 */
const walkRouter = (router, prefix, mounts, found) => {
  for (const layer of router.stack) {
    if (layer.route) {
      const routePath = toOpenApiPath(joinPath(prefix, layer.route.path));
      for (const [method, enabled] of Object.entries(layer.route.methods)) {
        if (enabled && method !== '_all') {
          found.add(`${method.toUpperCase()} ${routePath}`);
        }
      }
      continue;
    }

    const handler = layer.handle;
    if (typeof handler === 'function' && Array.isArray(handler.stack)) {
      const mountPath = mounts.get(handler);
      if (mountPath === undefined) {
        throw new Error(
          `Router mounted under "${prefix}" was not recorded; the mount hook missed it, ` +
          'so its routes cannot be checked against the OpenAPI spec.'
        );
      }
      walkRouter(handler, joinPath(prefix, mountPath), mounts, found);
    }
  }
};

const collectAppRoutes = async () => {
  const express = (await import('express')).default;

  const mounts = new Map();
  const originalUse = express.Router.prototype.use;
  express.Router.prototype.use = function recordingUse(...args) {
    if (typeof args[0] === 'string') {
      for (const handler of args.slice(1).flat(Infinity)) {
        if (typeof handler === 'function' && Array.isArray(handler.stack)) {
          mounts.set(handler, args[0]);
        }
      }
    }
    return originalUse.apply(this, args);
  };

  let app;
  try {
    const { buildTestApp } = await import('../helpers/app.js');
    app = buildTestApp();
  } finally {
    express.Router.prototype.use = originalUse;
  }

  const found = new Set();
  walkRouter(app.router ?? app._router, '', mounts, found);
  return found;
};

const collectSpecOperations = (spec) => {
  const found = new Set();
  for (const [routePath, pathItem] of Object.entries(spec.paths ?? {})) {
    for (const method of Object.keys(pathItem)) {
      if (HTTP_METHODS.has(method)) {
        found.add(`${method.toUpperCase()} ${routePath}`);
      }
    }
  }
  return found;
};

/**
 * Top-level `shape` of a Zod object, unwrapping the wrappers the validation
 * layer puts around one: `z.preprocess` and `.transform()` (both ZodPipe),
 * and `.optional()`. `.refine()` needs no unwrapping in Zod 4 — a refinement
 * is stored on the schema rather than wrapping it.
 */
const zodObjectShape = (schema, depth = 0) => {
  if (!schema || depth > 6) return null;
  const def = schema._zod?.def ?? schema._def;
  if (!def) return null;
  if (def.shape) return def.shape;
  for (const key of ['out', 'in', 'innerType']) {
    if (def[key]) {
      const shape = zodObjectShape(def[key], depth + 1);
      if (shape) return shape;
    }
  }
  return null;
};

const jsonRequestSchema = (operation) =>
  operation?.requestBody?.content?.['application/json']?.schema ?? null;

/**
 * Endpoints whose documented request body must match the schema that actually
 * validates it — creates and updates alike. Update bodies drift the same way
 * creates do and had never been checked: `payees.yml` documented
 * `transfer_acct` on both, and the transaction update body listed five of the
 * thirteen fields it accepts.
 *
 * `schedules.yml` documented a body (`recur`, `frequency`) that
 * `CreateScheduleSchema` had never accepted, which is the drift that motivated
 * this pairing.
 */
const BODY_CONTRACTS = [
  // creates
  { operation: 'POST /v2/accounts', schema: 'CreateAccountSchema' },
  { operation: 'POST /v2/accounts/{accountId}/transactions', schema: 'TransactionsAddSchema' },
  { operation: 'POST /v2/accounts/{accountId}/transactions/import', schema: 'TransactionsImportSchema' },
  { operation: 'POST /v2/categories', schema: 'CreateCategorySchema' },
  { operation: 'POST /v2/category-groups', schema: 'CreateCategoryGroupSchema' },
  { operation: 'POST /v2/payees', schema: 'CreatePayeeSchema' },
  { operation: 'POST /v2/payees/merge', schema: 'MergePayeesSchema' },
  { operation: 'POST /v2/tags', schema: 'CreateTagSchema' },
  { operation: 'POST /v2/account-groups', schema: 'CreateAccountGroupSchema' },
  { operation: 'POST /v2/rules', schema: 'CreateRuleSchema' },
  { operation: 'POST /v2/schedules', schema: 'CreateScheduleSchema' },
  { operation: 'POST /v2/accounts/{id}/close', schema: 'CloseAccountSchema' },
  { operation: 'POST /v2/budget/load', schema: 'LoadBudgetSchema' },
  // updates
  { operation: 'PUT /v2/accounts/{id}', schema: 'UpdateAccountSchema' },
  { operation: 'PUT /v2/transactions/{id}', schema: 'UpdateTransactionSchema' },
  { operation: 'PUT /v2/categories/{id}', schema: 'UpdateCategorySchema' },
  { operation: 'PUT /v2/category-groups/{id}', schema: 'UpdateCategoryGroupSchema' },
  { operation: 'PUT /v2/payees/{id}', schema: 'UpdatePayeeSchema' },
  { operation: 'PUT /v2/tags/{id}', schema: 'UpdateTagSchema' },
  { operation: 'PUT /v2/account-groups/{id}', schema: 'UpdateAccountGroupSchema' },
  { operation: 'PUT /v2/rules/{id}', schema: 'UpdateRuleSchema' },
  { operation: 'PUT /v2/schedules/{id}', schema: 'UpdateScheduleSchema' },
  { operation: 'PUT /v2/notes/{id}', schema: 'UpdateNoteSchema' },
];

describe('OpenAPI drift guard', () => {
  let appRoutes;
  let specOperations;
  let spec;
  let schemas;

  beforeAll(async () => {
    appRoutes = await collectAppRoutes();
    spec = await SwaggerParser.dereference(SPEC_PATH);
    specOperations = collectSpecOperations(spec);
    schemas = await import('../../src/validation/index.js');
  });

  it('finds routes and spec operations to compare', () => {
    expect([...appRoutes].filter(isV2).length).toBeGreaterThan(50);
    expect([...specOperations].filter(isV2).length).toBeGreaterThan(50);
  });

  it('documents every /v2 route the app serves', () => {
    const undocumented = [...appRoutes]
      .filter(isV2)
      .filter((entry) => !specOperations.has(entry))
      .sort();

    expect(undocumented).toEqual([]);
  });

  it('serves every /v2 operation the spec documents', () => {
    const unimplemented = [...specOperations]
      .filter(isV2)
      .filter((entry) => !appRoutes.has(entry))
      .sort();

    expect(unimplemented).toEqual([]);
  });

  describe.each(BODY_CONTRACTS)('$operation request body', ({ operation, schema }) => {
    const [method, routePath] = operation.split(' ');

    const documentedProperties = (specSchema) => {
      const properties = specSchema?.properties ?? {};
      const all = Object.keys(properties);
      // A deprecated property is a legacy alias folded in before validation
      // (`_date` → `date`), so it is documented but absent from the shape.
      const current = all.filter((name) => properties[name]?.deprecated !== true);
      return { all, current };
    };

    it('is documented with the properties the validator accepts', () => {
      const specSchema = jsonRequestSchema(spec.paths?.[routePath]?.[method.toLowerCase()]);
      expect(specSchema).not.toBeNull();
      // A documented body with no `properties` block at all would otherwise
      // compare as "nothing documented, nothing missing" and pass silently.
      expect(specSchema.properties).toBeDefined();

      const shape = zodObjectShape(schemas[schema]);
      expect(shape).not.toBeNull();

      const { all, current } = documentedProperties(specSchema);
      expect(current.filter((name) => !(name in shape)).sort()).toEqual([]);
      expect(Object.keys(shape).filter((name) => !all.includes(name)).sort()).toEqual([]);
    });

    it('documents the nested object properties the validator accepts', () => {
      const specSchema = jsonRequestSchema(spec.paths?.[routePath]?.[method.toLowerCase()]);
      const shape = zodObjectShape(schemas[schema]) ?? {};

      for (const [key, member] of Object.entries(shape)) {
        const nestedShape = zodObjectShape(member);
        const nestedSpec = specSchema?.properties?.[key];
        if (!nestedShape || !nestedSpec?.properties) continue;

        const { all, current } = documentedProperties(nestedSpec);
        expect({ key, extra: current.filter((name) => !(name in nestedShape)).sort() })
          .toEqual({ key, extra: [] });
        expect({ key, missing: Object.keys(nestedShape).filter((name) => !all.includes(name)).sort() })
          .toEqual({ key, missing: [] });
      }
    });
  });
});
