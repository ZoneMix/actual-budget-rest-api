# actual-budget-rest-api

`actual-rest-api` **v2.3.0** — an Express 5 REST wrapper around the Actual Budget
SDK. Production: this is the API behind the Belisario Ledger.

Independent repo (`github.com/ZoneMix/actual-budget-rest-api`), deliberately kept
out of the homelab monorepo so its Docker Hub publish pipeline and versioning
stay intact. Not to be confused with the legacy v1 at
`homelab/projects/budget-api-legacy/`.

## Stack

| Piece | Detail |
|---|---|
| Runtime | Node.js 22+ (CI also runs 24), ESM (`"type": "module"`), entry `src/server.js` |
| Framework | Express 5.2 |
| Engine | `@actual-app/api` **26.9.0, exact-pinned** |
| Auth DB | Postgres (`pg`) or SQLite (`better-sqlite3`) |
| Rate limits | `express-rate-limit`, Redis-backed via `ioredis` when configured |
| Validation | Zod 4 |
| Docs | OpenAPI in `src/docs/`, Swagger UI at `/docs` |
| Tests | Jest 30 with `--experimental-vm-modules` |

## Version lockstep — read before touching the SDK

`@actual-app/api` and the actual-server it syncs with must be the **same
version**. A mismatch fails at sync time, not at startup, so it looks like a
data bug rather than a version problem. Both are 26.9.0 today:
`package.json` pins the SDK exactly and `docker-compose.dev.yml` pins
`actualbudget/actual-server:26.9.0`. Upgrading means cutting both over together.

## Commands

```
npm test                   # jest, 68 suites
npm test -- tests/routes   # one directory
npm run test:coverage      # enforces jest.config.js coverageThreshold
npm run lint               # eslint src --max-warnings 0
npm run validate:openapi   # dereference + validate the spec
npm run dev                # node --watch src/server.js
docker compose -f docker-compose.dev.yml up --build   # API + actual-server + n8n + Redis + Postgres + Prom/Grafana
```

There is **no Docker on the maintainer's Mac**. `docker compose` commands are
for a machine that has it; do not assume a local build works.

## Deploy

The Mac never builds the image.

1. Tag `vX.Y.Z` and push. `.github/workflows/docker-publish.yml` builds
   `linux/amd64` and pushes `zonemix063/actual-rest-api` as `vX.Y.Z`, `X.Y.Z`
   and `latest`. Requires the `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`
   secrets; an expired PAT fails at the login step.
2. Mirror into private Harbor and **pin by digest**.
3. Deploy from the homelab repo's `deploy/ledger/docker-compose.yml` onto
   Proxmox **CT100**, via `pct push` and a compose recreate.

Do **not** restart an Umbrel or Portainer stack — the Ledger has not run there
since the CT100 migration.

## Test harness notes

- `jest.config.js` maps `@actual-app/api` to `tests/mocks/actual-api.js`. Every
  method in the SDK's `methods.d.ts` gets a `jest.fn()`; call `__reset()` in
  `beforeEach`. A test that needs a method the mock lacks means the SDK moved —
  add it to `METHOD_NAMES`, do not stub around it.
- `tests/setup.js` sets the env the app validates at import time. A new
  **required** variable in `src/config/env.js` must be added there or every
  suite fails at import.
- ESM + `jest.mock` do not mix. To patch a module before the app imports it,
  `await import()` inside `beforeAll` rather than importing at the top of the
  file — `tests/docs/openapi-routes.test.js` does this to wrap
  `Router.prototype.use`.
- `coverageThreshold` is a ratchet: raise it when coverage rises, never lower it
  to make a run pass.
- `tests/data/` is gitignored runtime state, created by `tests/setup.js`.

## Drift guards

Three tests fail when the code and its descriptions diverge. If one breaks,
the fix is usually the source of truth it names, not the test.

| Test | Pins |
|---|---|
| `tests/docs/openapi-routes.test.js` | Every `/v2` route is documented and every documented `/v2` path exists; create-endpoint request bodies match their Zod schemas |
| `tests/validation/constants.test.js` | Rule field/op enums against the installed SDK's own source |
| `npm run validate:openapi` | The spec parses, resolves and validates |

## Submodule

`n8n-nodes-actual-budget-rest-api/` is a git submodule
(`git@github.com:ZoneMix/n8n-nodes-actual-budget-rest-api.git`, branch `main`).
Clone with `--recurse-submodules`, or run
`git submodule update --init --recursive` afterwards. It is excluded from Jest
via `modulePathIgnorePatterns`.

## Secrets

`.env`, `.env.local` and `.env.keys` are never committed; the pre-commit hook
blocks them by name. `.env.example` **is** tracked and must stay complete — it
is the only place the full variable list is annotated. Never widen the
lint-staged pattern back to `.env*`; that glob untracks `.env.example`.

## Conventions

- Immutable data: schemas and helpers return new objects. `withOffbudgetAlias`
  and `withDateAlias` fold legacy keys without mutating the input.
- Files stay ≤ 200 lines (this repo's convention, stricter than the global
  200–400 guideline). `src/app.js` (200) and `src/routes/health-checks.js` (192)
  sit at that cap — split before adding to either.
- Errors are explicit: throw a typed error from `src/errors/`, let
  `asyncHandler` and `errorHandler` render it. Never swallow.
- Handlers read `req.validatedBody` / `req.validatedParams` /
  `req.validatedQuery`, never `req.body`.
- Commits: `<type>: <description>`, staged file by file. Never `git add -A`.

## Known follow-ups

- **Queue watchdog.** A caller-side timeout does not cancel the engine call, so
  a slot stays held until that call settles (`withTimeout` in
  `src/services/actual/queue.js`). `ACTUAL_LOAD_TIMEOUT_MS` keeps the slow
  whole-ledger operations from timing out spuriously, but nothing yet detects a
  slot held far past any budget and reports or recycles it. That watchdog is
  still to be built.

## Follow-ups when `@actual-app/api` 26.10.0 lands

Two SDK methods are expected that this wrapper has no route for, because 26.9.0
does not export them:

- **`setPreference`** — `GET /v2/preferences` is read-only today for exactly
  this reason (see the header comment in `src/routes/preferences.js`). Adding
  the writer means a `PUT`, a schema, and the write scope.
- **`mergeTransactions`** — no equivalent exists now; `POST /v2/payees/merge` is
  the payee-level analogue to model it on.

Confirm against `node_modules/@actual-app/api/@types/methods.d.ts` before
building either — the mock's `METHOD_NAMES` list is generated from that file and
is the fastest way to see what the installed SDK actually exports.

## Documentation map

| File | Contents |
|---|---|
| `README.md` | Endpoints, scopes, sync semantics, env vars, deploy, deprecations |
| `ARCHITECTURE.md` | Source tree, request flow, engine queue and sync policy |
| `SECURITY.md` | Threat model, scope enforcement, scanning, secret rotation |
| `docs/PRE_COMMIT.md` | The two git hooks and how to satisfy them |
| `CHANGELOG.md` | Release history |
