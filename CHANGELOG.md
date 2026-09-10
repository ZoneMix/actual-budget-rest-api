# Changelog

All notable changes to this project are documented in this file.

## 2.3.1

- **`POST /oauth/token` refresh refuses a deactivated or deleted user** (401) instead of
  minting a new pair for the refresh token's full TTL — the same guard `/v2/auth/login`
  gained in 2.3.0. The token route now honours `MAX_REQUEST_SIZE` like every other route.

## 2.3.0

### Fixed — endpoints that did not work

Seven call shapes were wrong against `@actual-app/api`. Query, rules and
schedules were non-functional, not merely inaccurate.

- `POST /v2/query` rebuilt against the real ActualQL builder; an `offset` with
  no `limit` was a SQLite syntax error, and the array `filter` the schema
  documented was rejected.
- `PUT /v2/rules/:id` — `updateRule` takes a whole rule, not `(id, fields)`.
  The wrapper now reads the rule, merges, and 404s on an unknown id.
- `POST /v2/schedules` — passes a bare schedule to `createSchedule`;
  `?resetNextDate=` is forwarded on update.
- `POST /v2/accounts/:id/transactions` — `addTransactions` takes an options
  object; `importTransactions` takes `opts`.
- `GET /v2/lookup/:type/:name` — `getIDByName` takes `(type, name)`
  positionally, and a miss answers the documented **404**. The engine never
  resolves null for one: it rejects with `APIError("Not found: ...")`, which
  used to surface as a 400.
- `POST /v2/accounts` — `account_group_id` is applied with a follow-up update,
  because the engine's create ignores it.
- Read-modify-write paths sync first, so a merge is not built on stale data.
- **Body size limits are per router again.** An app-wide `express.json()` read
  every request first, and body-parser then skipped the parser mounted on the
  router — so the 1 mb bulk limit and the 10 kb query limit were both silently
  capped at `MAX_REQUEST_SIZE`. `POST /v2/budgets/batch` answered 413 above
  roughly 96 operations while the schema and the spec promise 500.

### Fixed — engine rejections were 500s

The engine rejects a bad call by throwing `APIError(msg, meta)`, which is a
plain **object**, not an `Error`. It matched no branch of `createHttpError`, so
closing a funded account without `transferAccountId`, or an ActualQL
`calculate` naming something that is not a column, came back as
`500 INTERNAL_ERROR` — and in production the message was redacted, leaving the
caller with nothing to act on.

Those now render as **400 with `code: ENGINE_ERROR`**, carrying the engine's own
wording and its `meta` as `details`. `VALIDATION_ERROR` still means this
wrapper's schemas rejected the request before the engine saw it; `ENGINE_ERROR`
means the engine saw it and refused. Genuine faults are still 500s.

Two engine messages are not 400s, because rephrasing cannot fix either: a
missing row (`Not found: ...`) is **404 `NOT_FOUND`**, and a process with no
ledger loaded (`No budget file is open`) is **503 `SERVICE_UNAVAILABLE`**.

### Added — engine queue and sync policy

Every call into the embedded engine is serialised through one FIFO queue.

- `ACTUAL_QUEUE_MAX_DEPTH` (100) — pending operations above this are rejected
  with 503.
- `ACTUAL_OP_TIMEOUT_MS` (60000) — caller timeout, 504; the SDK call is not
  cancelled and keeps its slot.
- `ACTUAL_SYNC_MIN_INTERVAL_MS` (5000) — **reads may be up to this stale.**
  Writes always sync afterwards. `0` restores sync-before-every-read.
- `ACTUAL_LOAD_TIMEOUT_MS` (300000) — `POST /v2/budget/load` and
  `POST /v2/budget/export` move the whole ledger over the network and run under
  this instead. A timeout cancels nothing, so timing them out at 60 s would
  just leave the queue blocked behind a call still running.
- `ACTUAL_HEALTH_TIMEOUT_MS` (5000) — budget for the engine calls
  `GET /v2/health` makes.
- Also new: `ACTUAL_FILE_PASSWORD`, `ACTUAL_QUERY_MAX_RESULTS`,
  `ACTUAL_QUERY_MAX_FILTER_DEPTH`, `AUTH_SCOPE_ENFORCEMENT`, `JWT_ISSUER`,
  `JWT_AUDIENCE`.
- `GET /v2/health` reports queue depth and last sync state. It **observes** the
  engine and never drives it: it takes the instance only once startup has
  finished, so an anonymous poll can no longer trigger `init()` and a full
  budget download, and it never syncs, so polling cannot erase a recorded
  `lastSyncError`. Its engine calls do go through the queue — an anonymous
  caller must not interleave with a mutation — under `ACTUAL_HEALTH_TIMEOUT_MS`,
  so a queue held by a long export makes it answer `busy` rather than hang.
  `checks.actualApi.status` therefore has four values: `ok`, `not-initialised`,
  `busy` and `error`, and anything but `ok` is a 503.

### Added — endpoints

`/v2/tags`, `/v2/notes/:id`, `/v2/preferences` (read-only),
`/v2/account-groups`, `/v2/payees/common`, `/v2/budget/files`,
`/v2/budget/load`, `/v2/budget/export`, `/v2/sync`, `/v2/server/version`,
`/v2/lookup/:type/:name`, `/v2/accounts/:id/bank-sync`, `/v2/budgets/batch`,
plus `?hidden=` on categories and category groups, `?transferCategoryId=` on
their deletes, and `?resetNextDate=` on schedule update.

### Security

- **Scope enforcement.** `read` ⊂ `write` ⊂ `admin`, legacy `api` = read+write.
  Staged behind `AUTH_SCOPE_ENFORCEMENT`, **default `warn`**: a would-be denial
  logs `auth:SCOPE_WOULD_DENY` and the request proceeds. Admin operations sit
  outside the rollout and enforce in every mode.
- **`isAdmin` is scope-based.** A JWT for an admin user whose scope claim lacks
  `admin` now gets 403 on `/admin/*` and metrics reset. Tokens from
  `POST /v2/auth/login` carry `api,admin` and are unaffected.
- **JWT pinning.** Algorithm, `iss` and `aud` are pinned on every verify.
- **OAuth2 grants** are intersected with the client's `allowed_scopes` *and* the
  user's own scopes; a refresh keeps its granted scope and cannot widen it.
- **A refresh through `POST /v2/auth/login` checks the account is still live.**
  It read `role, scopes` with no `is_active` filter and no missing-row guard, so
  a deactivated or deleted user kept minting access tokens — with the legacy
  `api` grant, since a missing row expanded to it. Both now answer 401.
- **Authorization-code expiry is enforced by the lookup**, not by
  `pruneExpiredCodes()` having deleted the row first.
- **An OAuth request with no `scope` asks for the client's own
  `allowed_scopes`** (RFC 6749 §3.3). The default was hard-coded to `api`, so a
  client registered `allowed_scopes=read` was refused with `invalid_scope`
  unless it named `read` every time.
  Upgrade note: a client registered `api,admin` that never sent `scope` now
  receives `api admin` (still bounded by the user's own scopes) where it used to
  get `api`; register clients with exactly the scopes they should hold.
- **The access log records the path, not `req.originalUrl`.** Access logs are
  shipped and retained, and the query string is where a `?token=` or an OAuth
  redirect's credentials end up.
- `/admin/*` Bearer auth was broken by an un-awaited revocation check — an
  always-truthy Promise meant no token could authenticate. Same bug fixed in
  `/docs` auth.
- `PUT /admin/oauth-clients/:clientId` normalises `allowed_scopes` at the DB
  boundary instead of storing an array.
- `POST /v2/query` requires `read`, not `write` — it is a read over POST.
- Production `/v2/health` hides the upstream server version and raw error text.
- `POST /v2/budget/export` refuses an empty archive instead of returning a 200
  that looks like a successful backup.

### Changed

- Validation rebuilt on Zod 4, split into `src/validation/` by domain. Errors
  now carry real per-field details instead of a bare "Validation failed".
- Rule and schedule enums are pinned against the installed SDK's own source.
- CI repaired: lint, tests and OpenAPI validation on Node 22 and 24; every
  action pinned by SHA; weekly Trivy, gitleaks and npm audit. Snyk and OWASP
  Dependency-Check removed. Docker image on Node 24 LTS, pinned by digest.
- `POST /v2/accounts/:id/transactions` returns `result: 'ok'` and
  `submittedCount`.
- `POST /v2/query` returns `{ data, truncated }`.
- The OpenAPI spec takes `info.version` from `package.json`, and
  `tests/docs/openapi-routes.test.js` fails if a route or a create-endpoint body
  drifts from it.

### Deprecated — removed in 3.0.0

- `addedCount` on add-transactions → `submittedCount`. `addedIds` is already
  gone: `addTransactions` resolves with `"ok"` and returns no ids.
- `result` on `POST /v2/query` → `data`.
- `_date` in schedule bodies → `date`.
- `offBudget` in account bodies → `offbudget`.
- `AUTH_SCOPE_ENFORCEMENT` will default to `enforce`.
- `src/middleware/validation-schemas.js` is a re-export shim and will be
  removed; import from `src/validation/`.

### Known follow-ups

`@actual-app/api` 26.9.0 exports neither `setPreference` nor
`mergeTransactions`, so `/v2/preferences` is read-only and there is no
transaction-merge endpoint. Both are candidates once 26.10.0 lands.

A caller-side timeout does not cancel the engine call, so a queue slot stays
held until that call settles. `ACTUAL_LOAD_TIMEOUT_MS` keeps the slow
whole-ledger operations from timing out spuriously, but nothing yet detects a
slot held far past any budget and reports or recycles it.

## 2.2.2

- `@actual-app/api` 26.9.0 lockstep; clears adm-zip/csv-parse/qs advisories.
