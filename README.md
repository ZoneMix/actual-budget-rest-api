# Actual Budget REST API (Actual Budget API wrapper)

A secure Node.js/Express REST API that wraps the Actual Budget SDK (`@actual-app/api`). It provides JWT-based auth with nested scopes (read/write/admin), optional OAuth2 for n8n, admin API for OAuth client management, PostgreSQL or SQLite database support, Swagger documentation, and a hardened runtime (helmet, CORS, structured logging, rate limits per route).

![Actual REST API Login](images/login.png)

![Actual REST API Swagger UI](images/swaggerui.png)

```
# Create an Account

## Get Token
TOKEN=$(
    curl http://localhost:3000/v2/auth/login \
    -H "Content-Type: application/json" \
    -X POST \
    -d '{"username":"admin","password":"admin"}' \
    -s | jq -r '.access_token' \
)

## Get Accounts
curl http://localhost:3000/v2/accounts \
-H "Authorization: Bearer $TOKEN"

## Create 'test' Account
## An account has name / offbudget / closed / account_group_id — Actual has no
## account "type" field; on-budget vs off-budget is the only distinction.
curl http://localhost:3000/v2/accounts \
-H "Authorization: Bearer $TOKEN" \
-H "Content-Type: application/json" \
-d '{"account":{"name":"test","offbudget":true},"initialBalance":500}'

## Get Accounts, showing 'test'
curl http://localhost:3000/v2/accounts \
-H "Authorization: Bearer $TOKEN"
```

![Test Account Creation](images/test_account.png)

## Features
- Authentication: JWT access/refresh tokens, session login for docs, scope-based authorization
- Optional OAuth2: first-party flow for n8n (`/oauth/authorize`, `/oauth/token`)
- Admin API: OAuth client management endpoints (`/admin/oauth-clients`) with secure secret hashing
- Endpoints: accounts, transactions, budgets, categories, category groups, payees, tags, notes, preferences, account groups, budget files, rules, schedules, sync, lookup, query
- API Docs: protected Swagger UI at `/docs` with OpenAPI source in [src/docs/openapi.yml](src/docs/openapi.yml), guarded against drift by `tests/docs/openapi-routes.test.js`
- Database Support: PostgreSQL (recommended for production) or SQLite (default, simpler setup)
- Security: helmet headers, request IDs, token revocation, rate limiting, input validation, bcrypt-hashed OAuth secrets
- Environment Validation: Automatic validation of all environment variables on startup
- Metrics: Built-in Prometheus metrics collection at `/v2/metrics/prometheus` endpoint
- Monitoring: Pre-configured Prometheus and Grafana setup for real-time metrics visualization (see [monitoring/](monitoring/))
- Health Checks: Comprehensive health endpoint with database and API connectivity checks
- Redis Support: Optional Redis for distributed rate limiting (falls back to memory)
- Docker: production image + dev `docker compose` stack (Actual Server + n8n + Redis + Prometheus + Grafana)

## Endpoints

Every `/v2` route needs `Authorization: Bearer <access_token>`. The scope column
is the minimum a token must carry; see [Scopes](#scopes) below.

| Route group | Operations | Scope |
|---|---|---|
| `/v2/auth` | `POST /login`, `POST /logout` | none / any |
| `/v2/accounts` | `GET`, `POST`, `PUT /:id`, `DELETE /:id`, `POST /:id/close`, `POST /:id/reopen`, `GET /:id/balance?cutoff=`, `POST /:id/bank-sync` | read / write |
| `/v2/accounts/:id/transactions` | `GET ?start=&end=`, `POST`, `POST /import` | read / write |
| `/v2/transactions` | `PUT /:id`, `DELETE /:id` | write |
| `/v2/categories` | `GET ?hidden=`, `POST`, `PUT /:id`, `DELETE /:id?transferCategoryId=` | read / write |
| `/v2/category-groups` | `GET ?hidden=`, `POST`, `PUT /:id`, `DELETE /:id?transferCategoryId=` | read / write |
| `/v2/payees` | `GET`, `GET /common`, `POST`, `PUT /:id`, `DELETE /:id`, `POST /merge` | read / write |
| `/v2/tags` | `GET`, `POST`, `PUT /:id`, `DELETE /:id` | read / write |
| `/v2/notes` | `GET /:id`, `PUT /:id` | read / write |
| `/v2/preferences` | `GET` (read-only; the SDK exposes no writer) | read |
| `/v2/account-groups` | `GET`, `POST`, `PUT /:id`, `DELETE /:id` | read / write |
| `/v2/budgets` | `GET /months`, `GET /:month`, `POST /batch`, `POST /:month/categories/:categoryId/budget`, `POST /:month/categories/:categoryId/carryover`, `POST /:month/hold`, `POST /:month/reset-hold` | read / write |
| `/v2/budget` (files) | `GET /files` | read |
| `/v2/budget` (files) | `POST /load`, `POST /export` | **admin** |
| `/v2/rules` | `GET`, `GET /payees/:payeeId`, `POST`, `PUT /:id`, `DELETE /:id` | read / write |
| `/v2/schedules` | `GET`, `POST`, `PUT /:id?resetNextDate=`, `DELETE /:id` | read / write |
| `/v2/query` | `POST` — ActualQL, a read over POST | read |
| `/v2/sync` | `POST` | write |
| `/v2/server` | `GET /version` | read |
| `/v2/lookup` | `GET /:type/:name` — resolve a name to an id | read |
| `/v2/health` | `GET` — unauthenticated | none |
| `/v2/metrics` | `GET`, `GET /summary`, `GET /prometheus` | authenticated in production |
| `/v2/metrics` | `POST /reset` | **admin** |
| `/admin` | dashboard `GET /`, `GET|POST /oauth-clients`, `GET|PUT|DELETE /oauth-clients/:clientId` | **admin** |
| `/oauth` | `GET /authorize`, `POST /token` | n/a |
| root | `GET /login`, `POST /login`, `POST /logout`, `GET /docs` | session |

## Scopes

Scopes nest, so a wider one grants everything a narrower one does:

| Scope | Grants |
|---|---|
| `read` | Every GET, plus `POST /v2/query` |
| `write` | Everything `read` grants, plus creates, updates and deletes |
| `admin` | Everything `write` grants, plus the admin-only operations |

The legacy scope `api` is still issued and accepted; it expands to `read` +
`write`. A token from `POST /v2/auth/login` for an admin user carries
`api,admin`.

`AUTH_SCOPE_ENFORCEMENT` controls how a scope check behaves:

| Mode | Behaviour |
|---|---|
| `off` | Scope checks are skipped |
| `warn` (default) | A would-be denial logs `auth:SCOPE_WOULD_DENY` and the request proceeds |
| `enforce` | A denial is a 403 |

Rows marked **admin** in the endpoint table sit outside that rollout: they check
the admin scope directly and answer 403 in every mode. Being an admin user is
not enough — the token must carry the `admin` scope, so a narrow token minted
for an admin through an api-only OAuth client is refused.

## Sync semantics

Reads do not sync with the Actual server every time. A read syncs only when the
last successful sync is at least `ACTUAL_SYNC_MIN_INTERVAL_MS` old (default
`5000`), so **a response may reflect data up to that interval stale**. Set it to
`0` to restore sync-before-every-read at the cost of a round trip per request.

Writes always sync afterwards, so a write followed by a read is consistent
regardless of the interval. `POST /v2/sync` forces one immediately, and
`POST /v2/budget/load` forces the next read to sync because the freshness it
had was measured against a file that is no longer open.

Every call into the embedded engine is serialised through one queue. Pending
operations beyond `ACTUAL_QUEUE_MAX_DEPTH` are rejected with 503 rather than
queued forever, and a caller waiting longer than `ACTUAL_OP_TIMEOUT_MS` gets
504 — the engine call itself is not cancelled and keeps its slot until it
settles. `POST /v2/budget/load` and `POST /v2/budget/export` move the whole
ledger over the network, so they run under the longer `ACTUAL_LOAD_TIMEOUT_MS`
instead: timing one out would free nothing and just leave the queue blocked
behind a call still running.

## Requirements
- Node.js 22+ and npm
- Docker and Docker Compose (for recommended development workflow)
- Actual Budget Server credentials (or use the dev `docker compose` stack)
- For OAuth2 to n8n (optional): n8n instance and client credentials
- For production: Secrets manager (GitHub Secrets, AWS Secrets Manager, etc.) for secure environment variable management

## Installation & Setup

This section covers production deployment. For development setup, see the [Development](#development) section below.

### Prerequisites

1. **Clone the repository with submodules**:
   ```bash
   git clone --recurse-submodules https://github.com/ZoneMix/actual-budget-rest-api.git
   cd actual-budget-rest-api
   ```
   
   **Important**: The `--recurse-submodules` flag is required because this project includes the `n8n-nodes-actual-budget-rest-api` as a git submodule. If you've already cloned without it, run:
   ```bash
   git submodule update --init --recursive
   ```

2. **Docker and Docker Compose** (for containerized deployment):
   - Docker 20.10+ and Docker Compose 2.0+
   - Or use the production Docker image directly

### Minimum Environment Variables

Create a `.env` file with the following **minimum required variables** for production:

```bash
# Application environment
NODE_ENV=production

# Admin credentials
ADMIN_USER=admin
ADMIN_PASSWORD=YourSecurePassword123!  # Must meet complexity requirements (12+ chars, uppercase, lowercase, number, special char)

# JWT secrets (MUST be 32+ characters in production)
JWT_SECRET=your-jwt-secret-at-least-32-characters-long
JWT_REFRESH_SECRET=your-refresh-secret-different-from-jwt-secret
SESSION_SECRET=your-session-secret-different-from-jwt-secrets

# Actual Budget Server connection
ACTUAL_SERVER_URL=https://your-actual-server.com  # Your production Actual Server URL
ACTUAL_PASSWORD=your-actual-server-password
ACTUAL_SYNC_ID=your-budget-sync-id
```

**Generate secure secrets**:
```bash
# Generate secure secrets (32+ characters) - use different values for each!
openssl rand -base64 32  # For JWT_SECRET
openssl rand -base64 32  # For JWT_REFRESH_SECRET (must be different!)
openssl rand -base64 32  # For SESSION_SECRET (must be different!)
```

**Security Note**: In production, all secrets must be:
- At least 32 characters long
- Unique (never reuse the same secret for different purposes)
- Randomly generated (use `openssl rand -base64 32`)

See [.env.example](.env.example) for a complete list of all available environment variables with descriptions.

### Environment Management for Production

**For production deployments, use a secrets manager** to securely manage environment variables. This is the recommended approach for CI/CD pipelines, Kubernetes, and cloud deployments.

#### Option 1: GitHub Actions / GitHub Secrets (Recommended for CI/CD)

1. **Store secrets in GitHub**:
   - Go to your repository → Settings → Secrets and variables → Actions
   - Add each environment variable as a secret (e.g., `ADMIN_PASSWORD`, `JWT_SECRET`, etc.)

2. **Use in GitHub Actions workflow**:
   ```yaml
   - name: Deploy to production
     env:
       ADMIN_PASSWORD: ${{ secrets.ADMIN_PASSWORD }}
       JWT_SECRET: ${{ secrets.JWT_SECRET }}
       JWT_REFRESH_SECRET: ${{ secrets.JWT_REFRESH_SECRET }}
       # ... other secrets
     run: docker compose up -d --build
   ```

#### Option 2: AWS Secrets Manager / Parameter Store

1. **Store secrets in AWS**:
   ```bash
   aws secretsmanager create-secret \
     --name actual-rest-api/admin-password \
     --secret-string "YourSecurePassword123!"
   ```

2. **Retrieve and inject in deployment**:
   ```bash
   export ADMIN_PASSWORD=$(aws secretsmanager get-secret-value \
     --secret-id actual-rest-api/admin-password \
     --query SecretString --output text)
   ```

#### Option 3: Kubernetes Secrets

1. **Create secrets**:
   ```bash
   kubectl create secret generic actual-rest-api-secrets \
     --from-literal=ADMIN_PASSWORD='YourSecurePassword123!' \
     --from-literal=JWT_SECRET='your-jwt-secret' \
     # ... other secrets
   ```

2. **Reference in deployment**:
   ```yaml
   env:
     - name: ADMIN_PASSWORD
       valueFrom:
         secretKeyRef:
           name: actual-rest-api-secrets
           key: ADMIN_PASSWORD
   ```

#### Option 4: Docker Compose with .env file (Development Only)

For local development, you can use a `.env` file:
```bash
cp .env.example .env
# Edit .env with your values
docker compose up -d --build
```

**⚠️ Important**: Never commit `.env` files to git. Always use secrets managers in production.

### Production Deployment

**Docker Compose with PostgreSQL** (recommended for production):
```bash
# Set environment variables via secrets manager or .env file
# Required: DB_TYPE=postgres and PostgreSQL connection parameters
# POSTGRES_URL=postgresql://user:password@postgres:5432/database
# OR use individual parameters: POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD
docker compose -f docker-compose.prod.postgres.yml up -d --build
```

**Docker Compose with SQLite** (simpler, single-container):
```bash
# Set environment variables via secrets manager or .env file
# Required: DB_TYPE=sqlite
docker compose -f docker-compose.prod.sqlite.yml up -d --build
```

**Note**: For production, inject environment variables from your secrets manager (GitHub Secrets, AWS Secrets Manager, etc.) rather than using `.env` files.

**Docker Image**:
```bash
docker build -t actual-rest-api:latest .
docker run -d \
  --name actual-rest-api \
  -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  -e JWT_SECRET="$JWT_SECRET" \
  -e JWT_REFRESH_SECRET="$JWT_REFRESH_SECRET" \
  -e DB_TYPE=postgres \
  -e POSTGRES_URL="postgresql://user:password@host:5432/database" \
  # ... add all other required environment variables from secrets manager
  -v $(pwd)/data/actual-api:/app/.actual-cache \
  -p 3000:3000 \
  actual-rest-api:latest
```

**Note**: In production, retrieve secrets from your secrets manager and pass them as environment variables. Never hardcode secrets in scripts or commit them to version control.

### How this image is actually released

The maintainer's own deployment, for reference:

1. Tag a release. Pushing a `v*` tag runs
   [`docker-publish.yml`](.github/workflows/docker-publish.yml), which builds
   `linux/amd64` and pushes `zonemix063/actual-rest-api` tagged `vX.Y.Z`,
   `X.Y.Z` and `latest`. The `DOCKERHUB_TOKEN` secret must be a valid Docker Hub
   personal access token; an expired one fails the job at the login step.
2. The image is mirrored into a private Harbor registry and **pinned by
   digest**, so a deployment cannot silently pick up a re-pushed tag.
3. It runs on Proxmox container CT100, deployed from the homelab repository's
   `deploy/ledger/docker-compose.yml` via `pct push` and a compose recreate.

The build never happens on the maintainer's laptop — there is no Docker there —
so a locally-built image is not a supported path. `@actual-app/api` and the
actual-server it talks to move in lockstep; upgrading one without the other
fails at sync time rather than at startup, so both are cut over together.

**Production Checklist**:
- ✅ Use secrets manager (GitHub Secrets, AWS Secrets Manager, etc.) for all sensitive environment variables
- ✅ Use HTTPS with reverse proxy (nginx, Traefik, etc.)
- ✅ Set `TRUST_PROXY=true` if behind reverse proxy
- ✅ Configure `ALLOWED_ORIGINS` with production domains
- ✅ Set `LOG_LEVEL=warn` or `error` for production
- ✅ Configure Redis for distributed rate limiting
- ✅ Set up monitoring (Prometheus/Grafana) - see [monitoring/](monitoring/)
- ✅ Regular backups of `DATA_DIR` volume
- ✅ For n8n: Use HTTPS callback URLs, configure OAuth2 credentials
- ✅ Never commit `.env` files or secrets to version control

## Development

### Quick Start (Docker - Recommended)

1. **Setup environment**:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your values (see below for minimum requirements)
   ```

2. **Start all services**:
   ```bash
   docker compose -f docker-compose.dev.yml up --build
   ```

3. **Configure Actual Server** (first run only):
   - Open http://localhost:5006 → Set password → Create/open budget
   - Get Sync ID from Settings → Advanced → Show Sync ID
   - Update `ACTUAL_PASSWORD` and `ACTUAL_SYNC_ID` in `.env.local`
   - Restart: `docker compose -f docker-compose.dev.yml restart actual-rest-api-dev`

4. **Access services**:
   - API: http://localhost:3000
   - Actual Server: http://localhost:5006
   - n8n: http://localhost:5678
   - Grafana: http://localhost:3001 (admin/admin)
   - Prometheus: http://localhost:9090

**Minimum `.env.local` for development**:
```bash
ADMIN_USER=admin
ADMIN_PASSWORD=Password123!
JWT_SECRET=dev-secret-not-for-production
JWT_REFRESH_SECRET=dev-refresh-secret-not-for-production
ACTUAL_SERVER_URL=http://actual-server-dev:5006
ACTUAL_PASSWORD=<your-actual-server-password>
ACTUAL_SYNC_ID=<your-budget-sync-id>
```

**Note**: In development, missing secrets are auto-generated with warnings. Secrets can be shorter than production requirements.


### Monitoring

The dev stack includes Prometheus and Grafana. Access Grafana at http://localhost:3001 (admin/admin) → **Dashboards → Actual Budget REST API Metrics**.

The dashboard shows request rates, error rates, response times, and more. See [monitoring/README.md](monitoring/README.md) for configuration details.


## Environment Variables

Every variable below is validated on startup by [src/config/env.js](src/config/env.js).
Anything not listed here is not read by the app. Invalid or missing required
variables abort startup with a message naming the variable.

### Server

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `development` / `production` / `test`. Production tightens secret validation, cookie flags and error detail. |
| `PORT` | `3000` | TCP port to listen on. |
| `TRUST_PROXY` | unset | Trust `X-Forwarded-*`. Set behind a reverse proxy; implied by `NODE_ENV=production`. |

### Authentication and security

| Variable | Default | Purpose |
|---|---|---|
| `ADMIN_USER` | `admin` | Bootstrap admin username, created on first start. |
| `ADMIN_PASSWORD` | **required** | Password for that account. |
| `JWT_SECRET` | dev: generated | Access-token signing key. Required in production, 32+ chars. |
| `JWT_REFRESH_SECRET` | dev: generated | Refresh-token key. Required in production, 32+ chars, different from `JWT_SECRET`. |
| `SESSION_SECRET` | dev: generated | Session cookie key. Required in production, 32+ chars, different from both JWT secrets. |
| `JWT_ACCESS_TTL` | `1h` | Access-token lifetime. |
| `JWT_REFRESH_TTL` | `24h` | Refresh-token lifetime. |
| `AUTH_SCOPE_ENFORCEMENT` | `warn` | `off` / `warn` / `enforce` — see [Scopes](#scopes). |
| `JWT_ISSUER` | `actual-wrapper` | `iss` claim, pinned on sign and verify. Changing it invalidates every issued token. |
| `JWT_AUDIENCE` | `n8n` | `aud` claim, same caveat. |

### Actual Budget

| Variable | Default | Purpose |
|---|---|---|
| `ACTUAL_SERVER_URL` | **required** | URL of the actual-server instance. |
| `ACTUAL_PASSWORD` | **required** | Password for that server. |
| `ACTUAL_SYNC_ID` | **required** | Sync id of the budget file to open (Actual: Settings → Advanced). |
| `ACTUAL_FILE_PASSWORD` | unset | End-to-end encryption password. Set only when the budget file is E2E encrypted. |
| `DATA_DIR` | `/app/.actual-cache` | Local engine cache. Must be a persistent, writable volume — losing it forces a full re-sync. |

### Engine queue and sync policy

| Variable | Default | Purpose |
|---|---|---|
| `ACTUAL_QUEUE_MAX_DEPTH` | `100` | Pending engine operations above this are rejected with 503. |
| `ACTUAL_OP_TIMEOUT_MS` | `60000` | Per-operation caller timeout; on expiry the caller gets 504 and the engine call keeps its slot. |
| `ACTUAL_HEALTH_TIMEOUT_MS` | `5000` | Budget for the engine calls `GET /v2/health` makes. On expiry the probe reports `busy` instead of waiting for the queue. |
| `ACTUAL_LOAD_TIMEOUT_MS` | `300000` | Caller timeout for `POST /v2/budget/load` and `POST /v2/budget/export`, which move the whole ledger and outrun the ordinary one. |
| `ACTUAL_SYNC_MIN_INTERVAL_MS` | `5000` | Minimum age of the last sync before a read triggers another. `0` syncs before every read. See [Sync semantics](#sync-semantics). |

### Database (auth: users, tokens, OAuth clients — not the budget)

| Variable | Default | Purpose |
|---|---|---|
| `DB_TYPE` | `postgres` | `postgres` or `sqlite`. SQLite stores the DB at `$DATA_DIR/auth.db`. |
| `POSTGRES_URL` | unset | `postgresql://user:password@host:port/database`. |
| `POSTGRES_HOST` / `POSTGRES_PORT` / `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | unset | Alternative to `POSTGRES_URL`; all four of host/db/user/password are needed together. |

### Redis, CORS, logging and limits

| Variable | Default | Purpose |
|---|---|---|
| `REDIS_URL` / `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | unset | Shared rate-limit store. Without it limits are per-process, which is wrong with more than one instance. |
| `ALLOWED_ORIGINS` | `http://localhost:3000,http://localhost:5678` | Comma-separated browser origins. Requests with no `Origin` are always allowed. |
| `LOG_LEVEL` | `info` | `error` / `warn` / `info` / `debug`. |
| `ENABLE_CORS` / `ENABLE_HELMET` / `ENABLE_RATE_LIMITING` | `true` | Middleware toggles. |
| `MAX_REQUEST_SIZE` | `10kb` | Body limit for ordinary routes. There is no app-wide parser: each router mounts exactly one, so the bulk routes (transaction add/import, `POST /v2/budgets/batch`) keep their own 1 mb limit and `POST /v2/query` its own 10 kb one, independent of this value. |
| `ACTUAL_QUERY_MAX_RESULTS` | `10000` | Rows `POST /v2/query` returns before truncating (`truncated: true`). |
| `ACTUAL_QUERY_MAX_FILTER_DEPTH` | `5` | Maximum `$and`/`$or` nesting before a query is rejected with 400. |

**Development mode**: with `NODE_ENV=development` the three secrets are
auto-generated at startup with a warning, so tokens and sessions do not survive
a restart.

See [.env.example](.env.example) for the same list with inline commentary.

## API Docs & Validation
- OpenAPI source: [src/docs/openapi.yml](src/docs/openapi.yml)
- Local docs (auth required): GET `/docs`
- Validate OpenAPI:

```bash
npm run validate:openapi
```

## Auth Flows
- Local login (session for docs):
	- GET `/docs` → redirect to `/login`
	- POST `/login` → create session, then access `/docs`
- JWT login:
	- POST `/v2/auth/login` with `{ "username": "admin", "password": "..." }`
	- Response contains `access_token`, `refresh_token`, `expires_in`, `scope`, `token_type`
	- Tokens include user `role` and `scopes` for authorization
	- Send `Authorization: Bearer <access_token>` to protected routes
	- Rate limited: 5 requests per 15 minutes
- JWT logout:
	- POST `/v2/auth/logout` with optional `refresh_token` in body
	- Revokes both access and refresh tokens for secure session termination
- n8n OAuth2 (optional):
  - Configure env vars listed above
  - Endpoints available: `/oauth/authorize`, `/oauth/token`
  - Client secrets are hashed with bcrypt before storage
  - See [Connecting n8n](#connecting-n8n) for setup details.
- Admin API (requires an admin user AND a token carrying the `admin` scope):
  - Access admin dashboard at `/admin` (HTML interface)
  - Manage OAuth clients via `/admin/oauth-clients` endpoints
  - Requires JWT token with `admin` role and `admin` scope

## Query Endpoint

The `/v2/query` endpoint allows executing ActualQL queries against Actual Budget data:
- **Security**: Table whitelist, filter depth limits, result size limits
- **Rate Limited**: 20 requests per minute
- **Audit Logging**: All queries logged with user ID and request context
- **Documentation**: See [ActualQL docs](https://actualbudget.org/docs/api/actual-ql/)

## Connecting n8n

### OAuth2 Flow (Recommended)

1. **Create the OAuth client** through the admin API — there are no
   `N8N_CLIENT_ID`/`N8N_CLIENT_SECRET` environment variables; clients live in
   the database. See [Admin API](#admin-api) below:
   ```bash
   curl http://localhost:3000/admin/oauth-clients \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -X POST \
     -d '{"client_id":"example-n8n","allowed_scopes":"api","redirect_uris":"http://localhost:5678/rest/oauth2-credential/callback"}'
   ```
   Save the returned `client_secret` — it is shown once. `allowed_scopes` caps
   what any token issued to this client can carry, and the grant is further
   intersected with the authorizing user's own scopes.

2. **In n8n, create OAuth2 credential**:
   - Type: **OAuth2**
   - Authorization URL: `http://localhost:3000/oauth/authorize` (or your API URL)
   - Token URL: `http://actual-rest-api-dev:3000/oauth/token` (use Docker service name)
   - Client ID & Secret: the values from step 1
   - Redirect URL: must match a `redirect_uris` entry on the client

3. **Use in workflows**: Select the OAuth2 credential in HTTP request nodes.

**Benefits**: Automatic token refresh, no passwords stored, revocable tokens.

### Alternative: Bearer Token

For development, use JWT bearer tokens:
1. POST to `/v2/auth/login` → Get `access_token`
2. In n8n HTTP node, set header: `Authorization: Bearer <token>`

**Note**: In production behind a reverse proxy, replace `localhost` and Docker hostnames with actual domains.

## Admin API

The Admin API provides endpoints for managing OAuth clients. All endpoints require a bearer token for an admin user whose scope claim includes `admin`. An admin user holding a narrower token is refused — the scope is checked, not just the role.

### Accessing the Admin Dashboard

1. **Web Interface**: Navigate to `/admin` in your browser (requires admin session login)
2. **API Endpoints**: Use JWT tokens with `admin` role and `admin` scope

### Admin Endpoints

- `GET /admin/oauth-clients` - List all OAuth clients (without secrets)
- `POST /admin/oauth-clients` - Create a new OAuth client (auto-generates secret if not provided)
- `GET /admin/oauth-clients/:clientId` - Get a specific OAuth client
- `PUT /admin/oauth-clients/:clientId` - Update an OAuth client (secret, scopes, redirect URIs)
- `DELETE /admin/oauth-clients/:clientId` - Delete an OAuth client

### Example: Creating an OAuth Client

```bash
# Get admin token
TOKEN=$(curl http://localhost:3000/v2/auth/login \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"username":"admin","password":"admin"}' \
  -s | jq -r '.access_token')

# Create a new OAuth client
curl http://localhost:3000/admin/oauth-clients \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{
    "client_id": "my-app",
    "allowed_scopes": "api",
    "redirect_uris": "http://localhost:8080/callback"
  }'
```

**Note**: The `client_secret` is only returned once on creation - save it immediately! All secrets are hashed with bcrypt before storage.

## CLI Commands

```bash
# Testing & Quality
npm test             # Run tests
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage
npm run lint         # Lint code
npm run audit        # Security audit
npm run validate:openapi  # Validate OpenAPI spec

# Docker Development
docker compose -f docker-compose.dev.yml up --build
docker compose -f docker-compose.dev.yml logs -f actual-rest-api-dev
```

See [docs/PRE_COMMIT.md](docs/PRE_COMMIT.md) for the pre-commit hooks.

## Breaking in 3.0.0

Everything below still works today and is marked `deprecated` in the OpenAPI
spec. Migrate before 3.0.0, when they are removed.

| Deprecated | Replacement |
|---|---|
| `addedCount` on `POST /v2/accounts/:id/transactions` | `submittedCount`. Responses already carry `Deprecation` and `Warning` headers. |
| `addedIds` on the same response | Already removed. Actual's `addTransactions` resolves with the string `"ok"` and returns no ids, so the field never held real data. |
| `result` on `POST /v2/query` | `data`. Check `truncated` to detect a capped result set. |
| `_date` in schedule bodies | `date`. Note `date` is a calendar string *or* a recurrence object — there is no separate `recur` or `frequency` field. |
| `offBudget` in account bodies | `offbudget`, the SDK's own spelling. |

Also changing in 3.0.0:

- `AUTH_SCOPE_ENFORCEMENT` will default to `enforce`. Watch for
  `auth:SCOPE_WOULD_DENY` in the logs and widen or re-mint those tokens first.
- `src/middleware/validation-schemas.js` is a re-export shim for
  `src/validation/`; it will be removed. Import from `src/validation/` directly.

## Data & Persistence
- **Database Options**:
  - **PostgreSQL** (recommended for production): Set `DB_TYPE=postgres` and configure `POSTGRES_URL` or individual connection parameters
  - **SQLite** (default, simpler setup): Set `DB_TYPE=sqlite`, database stored at `${DATA_DIR}/auth.db`
- **Automatic Migrations**: Schema migrations run on startup (adds `role`, `scopes`, `updated_at` columns to users table, `client_secret_hashed` to clients table)
- **User Roles & Scopes**: Users have `role` (e.g., `admin`, `user`) and `scopes` (comma-separated, e.g., `api,admin`) for authorization
- **OAuth Client Secrets**: All client secrets are hashed with bcrypt before storage for security
- Actual SDK cache and budget data are managed by `@actual-app/api` using `DATA_DIR`

## Observability

- **Logging**: Structured JSON logs (winston), respects `LOG_LEVEL`. Each request includes `X-Request-ID` for tracing.
- **Metrics**: Prometheus endpoint at `/v2/metrics/prometheus`, JSON at `/v2/metrics` and `/v2/metrics/summary`. All of them require a bearer token in production, so a scrape job needs one. Pre-configured Grafana dashboards in [monitoring/](monitoring/).
- **Health**: `GET /v2/health` returns 200 (healthy) or 503 (degraded), unauthenticated. It observes the engine but never drives it: it takes the instance only once startup has finished (reporting `not-initialised` otherwise, never triggering `init()` itself) and never syncs, so a health poll cannot drive sync traffic or erase a recorded sync error. Its engine calls do go through the queue, under the shorter `ACTUAL_HEALTH_TIMEOUT_MS`, so a queue held by a long export makes it answer `busy` rather than hang. In production it hides the upstream server version and raw error text, which would otherwise let an anonymous caller fingerprint the host.

## CI / Security

Three workflows, every `uses:` pinned to a full commit SHA and kept current by
Dependabot. No workflow pipes a remote installer into a shell.

**[`ci.yml`](.github/workflows/ci.yml)** — on pull request and push to `main`:

- lint, `npm test` and `npm run validate:openapi` on a Node 22 and Node 24 matrix
- `npm audit --omit=dev --audit-level=high`
- a Docker build of the production image, smoke-tested with `node --check`

**[`security.yml`](.github/workflows/security.yml)** — on push, pull request,
and weekly on Sunday 00:00 UTC:

- npm audit: production deps at `high` block, the full tree at `moderate` reports
- ESLint with `eslint-plugin-security`
- gitleaks over full history
- Trivy against the built image (`CRITICAL,HIGH`, `ignore-unfixed`), SARIF
  uploaded to code scanning

**[`docker-publish.yml`](.github/workflows/docker-publish.yml)** — on a `v*` tag
(or `workflow_dispatch` for an existing tag): builds and pushes
`zonemix063/actual-rest-api` as `vX.Y.Z`, `X.Y.Z` and `latest`. Needs the
`DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` secrets, the latter a valid Docker
Hub personal access token.

Snyk and OWASP Dependency-Check were removed: Snyk needed a token the project
does not have, and Dependency-Check duplicated npm audit while adding minutes to
every run.

SARIF uploads need `permissions: { security-events: write, actions: read }`, and
are skipped for pull requests from forks, which cannot hold those permissions.

## Project Structure
- App builder: [src/app.js](src/app.js); process bootstrap: [src/server.js](src/server.js)
- Routes: [src/routes](src/routes) — one router per resource, thin handlers
- Services: [src/services/actual](src/services/actual) — the engine wrapper: client, queue, sync policy, and one module per domain
- Validation: [src/validation](src/validation) — Zod schemas, one file per domain
- Auth: [src/auth](src/auth) — JWT, scopes, permissions, OAuth2
- Config: [src/config](src/config) — environment validation and the Swagger loader
- Docs: [src/docs](src/docs) — OpenAPI source
- Errors: [src/errors](src/errors); middleware: [src/middleware](src/middleware); logging: [src/logging](src/logging)
- Tests: [tests](tests) — Jest, mirroring the source layout

## Documentation
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture and design patterns
- [SECURITY.md](SECURITY.md) - Threat model, scopes, scanning, secret rotation
- [docs/PRE_COMMIT.md](docs/PRE_COMMIT.md) - Git hooks
- [CHANGELOG.md](CHANGELOG.md) - Release history
- [AGENTS.md](AGENTS.md) - Working notes for coding agents
- [.env.example](.env.example) - Complete environment variable reference
