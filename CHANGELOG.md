# Changelog

All notable changes to this project are documented in this file.

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
  positionally.
- `POST /v2/accounts` — `account_group_id` is applied with a follow-up update,
  because the engine's create ignores it.
- Read-modify-write paths sync first, so a merge is not built on stale data.

### Added — engine queue and sync policy

Every call into the embedded engine is serialised through one FIFO queue.

- `ACTUAL_QUEUE_MAX_DEPTH` (100) — pending operations above this are rejected
  with 503.
- `ACTUAL_OP_TIMEOUT_MS` (60000) — caller timeout, 504; the SDK call is not
  cancelled and keeps its slot.
- `ACTUAL_SYNC_MIN_INTERVAL_MS` (5000) — **reads may be up to this stale.**
  Writes always sync afterwards. `0` restores sync-before-every-read.
- Also new: `ACTUAL_FILE_PASSWORD`, `ACTUAL_QUERY_MAX_RESULTS`,
  `ACTUAL_QUERY_MAX_FILTER_DEPTH`, `AUTH_SCOPE_ENFORCEMENT`, `JWT_ISSUER`,
  `JWT_AUDIENCE`.
- `GET /v2/health` reports queue depth and last sync state, without entering
  the queue itself.

### Added — endpoints

`/v2/tags`, `/v2/notes/:entityId`, `/v2/preferences` (read-only),
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

## 2.2.2

- `@actual-app/api` 26.9.0 lockstep; clears adm-zip/csv-parse/qs advisories.
