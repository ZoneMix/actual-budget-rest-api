# Actual Budget REST API (Actual Budget API wrapper)

A secure Node.js/Express REST API that wraps the Actual Budget SDK (`@actual-app/api`). It provides JWT-based auth, optional OAuth2 for n8n, Swagger documentation, and a hardened runtime (helmet, CORS, structured logging, rate limits per route).

![Actual REST API Login](images/login.png)

![Actual REST API Swagger UI](images/swaggerui.png)

```
# Create an Account

## Get Token
TOKEN=$(
    curl http://localhost:3000/auth/login \
    -H "Content-Type: application/json" \
    -X POST \
    -d '{"username":"admin","password":"admin"}' \
    -s | jq -r '.access_token' \
)

## Get Accounts
curl http://localhost:3000/accounts \
-H "Authorization: Bearer $TOKEN"

## Create 'test' Account
curl http://localhost:3000/accounts \
-H "Authorization: Bearer $TOKEN" \
-H "Content-Type: application/json" \
-d '{"account":{"name":"test","offbudget":true,"closed":true},"initialBalance":500}'

## Get Accounts, showing 'test'
curl http://localhost:3000/accounts \
-H "Authorization: Bearer $TOKEN"
```

![Test Account Creation](images/test_account.png)

## Features
- Authentication: JWT access/refresh tokens, session login for docs
- Optional OAuth2: first-party flow for n8n (`/oauth/authorize`, `/oauth/token`)
- Endpoints: accounts, transactions, budgets, categories, payees, rules, schedules, query
- API Docs: protected Swagger UI at `/docs` with OpenAPI source in [src/docs/openapi.yml](src/docs/openapi.yml)
- Security: helmet headers, request IDs, SQLite token revocation, rate limiting, input validation
- Environment Validation: Automatic validation of all environment variables on startup
- Metrics: Built-in metrics collection at `/metrics` endpoint
- **Grafana Monitoring**: Pre-configured Grafana dashboard for real-time metrics visualization (development)
- Health Checks: Comprehensive health endpoint with database and API connectivity checks
- Redis Support: Optional Redis for distributed rate limiting (falls back to memory)
- Docker: production image + dev `docker compose` stack (Actual Server + n8n + Redis + Grafana)

## Requirements
- Node.js 22+ and npm
- Actual Budget Server credentials (or use the dev `docker compose` stack)
- For OAuth2 to n8n (optional): n8n instance and client credentials
- For production: dotenvx CLI and encrypted `.env` file with `DOTENV_PRIVATE_KEY`

## Development

**Recommended: Docker-Driven Development**

This project is designed for Docker-driven development. All services (API, Actual Server, n8n, Redis) run in containers with proper environment configuration. 

**Why Docker?**
- All environment variables are managed in `.env.local` (mounted into container)
- No need to manually export or set environment variables
- Consistent development environment across machines
- All dependencies (Actual Server, Redis, n8n) run automatically
- Hot reload works via Docker volume mounts

**Local `npm start` or `npm run dev`** requires manual environment variable setup and is not the primary development workflow. See Option 2 below for advanced local development.

### Option 1: Docker Dev Stack (Recommended - Full-featured, Simplest)
Bring up all services (API + Actual Server + n8n + Redis) with automatic rebuilds on code changes:

```bash
docker compose -f docker-compose.dev.yml up --build --force-recreate --remove-orphans
```

First-run initialization (Actual Server):
- On first startup, Actual Server is not configured.
- Open http://localhost:5006 and set a password.
- Create/open your budget and obtain the Sync ID:
  - In the Actual app, go to Settings → Advanced → Show Sync ID (or similar).
- Add the following to `.env.local` (mounted as `/app/.env` in the API container):

```
ADMIN_USER=admin
ADMIN_PASSWORD=Password123!

# In development, secrets can be shorter or omitted (auto-generated)
# In production, these must be 32+ characters
JWT_SECRET=dev-secret-not-for-production
JWT_REFRESH_SECRET=dev-refresh-secret-not-for-production

ACTUAL_SERVER_URL=http://actual-server-dev:5006
ACTUAL_PASSWORD=<the password you set in Actual Server>
ACTUAL_SYNC_ID=<your budget sync id>

# Optional n8n OAuth2
N8N_CLIENT_ID=example-n8n
N8N_CLIENT_SECRET=replace-with-long-secret  # 32+ chars in production
N8N_OAUTH2_CALLBACK_URL=http://localhost:5678/rest/oauth2-credential/callback

# Optional Redis for distributed rate limiting
# REDIS_HOST=redis
# REDIS_PORT=6379
# REDIS_PASSWORD=  # Optional, set if Redis has password
```

Then restart the API container (or re-run the compose command) so it picks up `.env.local`.

**Note**: In development mode, missing secrets are auto-generated with warnings. For production, ensure all secrets are 32+ characters and unique.

**Reducing Log Output:**
- Set `LOG_LEVEL=warn` or `LOG_LEVEL=error` in `.env.local` to reduce verbosity
- View only specific service logs: `docker compose -f docker-compose.dev.yml logs -f actual-api-wrapper`
- See [docs/LOGGING.md](docs/LOGGING.md) for detailed logging configuration

Ports:
- API: http://localhost:3000
- n8n: http://localhost:5678
- Actual Server: http://localhost:5006
- Redis: localhost:6379 (optional, for distributed rate limiting)
- **Grafana (Metrics): http://localhost:3001** (username: `admin`, password: `admin`)

### Monitoring with Grafana

Grafana is pre-configured to monitor your API metrics. After starting the services:

1. Open http://localhost:3001 in your browser
2. Login with `admin` / `admin` (change password if prompted)
3. Navigate to **Dashboards → API Metrics Dashboard**

The dashboard shows:
- Total requests over time
- Error rate gauge
- Average response time
- Requests by HTTP method (pie chart)
- Requests by route (table)
- Errors by status code (table)

See [grafana/README.md](grafana/README.md) for detailed setup and customization instructions.

### Option 2: Local Development (Advanced - Requires Manual Setup)

**Note**: This requires manually setting up all environment variables. Docker-driven development (Option 1) is recommended.

If you want to run the API locally for faster iteration:

1. Start Actual Server in Docker:

```bash
docker compose -f docker-compose.dev.yml up -d actual-server redis
```

2. Create a `.env.local` file with all required variables (see `.env.example` for reference):

```bash
# Copy and customize from .env.example
cp .env.example .env.local
# Edit .env.local with your values
```

3. Install dependencies and run:

```bash
npm ci
npm run dev  # Uses Node --watch for hot reload
```

**Requirements for local development:**
- All environment variables must be set in `.env.local` or exported
- Actual Server must be running (Docker or external)
- Redis optional (falls back to memory store)
- Development mode auto-generates missing secrets (with warnings)

**Benefits**: Code changes reload instantly via Node `--watch`; no Docker rebuilds needed.
**Drawbacks**: Requires manual environment setup; not the primary development workflow.

## Production
Set the same Actual credentials via environment variables in `.env` (not `.env.local`). The production Actual Server provides the password and sync id values. For n8n in production:
- Configure the same OAuth2 endpoint and credentials
- Ensure `ALLOWED_ORIGINS` includes your n8n instance's URL
- Use HTTPS for the callback URL

### Environment Management with dotenvx
This project uses **dotenvx** to manage encrypted environment files. In production, a `.env` file (or encrypted `.env.prod`) is required along with the decryption key.

1. Create a `.env` file with production values or use dotenvx to encrypt it:

```bash
# Initialize dotenvx (generates .env.keys)
echo "ADMIN_USER=admin" > .env
dotenvx encrypt
dotenvx decrypt

# Encrypt your production .env
dotenvx set ADMIN_PASSWORD "your-production-password"
dotenvx set JWT_SECRET "your-production-jwt-secret"
# ... repeat for other required vars

dotenvx encrypt
```

2. Securely store the private key:
   - The key is in `.env.keys` (never commit this)
   - Provide `DOTENV_PRIVATE_KEY` to the runtime (e.g., as a secret in CI/CD or container env)
   - The Docker container reads `DOTENV_PRIVATE_KEY` from the environment or compose file

3. Run with dotenvx:

```bash
# With the private key set:
export DOTENV_PRIVATE_KEY="$(grep DOTENV_PRIVATE_KEY .env.keys | cut -d '=' -f2 | tail -n1)"

# Or in Docker:
docker run \
  -v ./data/actual-api:/app/.actual-cache \
  -p 3000:3000 \
  actual-api-wrapper:latest

# Or with compose:
docker compose up -d --force-recreate --build
```

See the [docker-compose.yml](docker-compose.yml) for how it's wired up in containers.

## Environment Variables

All environment variables are validated on startup using Zod schemas. Invalid or missing required variables will cause the application to exit with clear error messages.

### Required Variables
- `ADMIN_USER`: admin username (default `admin`)
- `ADMIN_PASSWORD`: required; admin password (validated for complexity)
- `JWT_SECRET`: required in production; auto-generated in development if omitted (32+ chars in production)
- `JWT_REFRESH_SECRET`: required in production; auto-generated in development if omitted (32+ chars in production)
- `ACTUAL_SERVER_URL`: Actual server URL (e.g., `http://localhost:5006`)
- `ACTUAL_PASSWORD`: Actual server password
- `ACTUAL_SYNC_ID`: Budget sync ID

### Optional Variables
- `SESSION_SECRET`: required in production; auto-generated in development if omitted (32+ chars in production)
- `JWT_ACCESS_TTL`: optional, default `1h` (supports `30m`, `3600`, etc.)
- `JWT_REFRESH_TTL`: optional, default `24h`
- `PORT`: server port (default `3000`)
- `ALLOWED_ORIGINS`: CSV of allowed origins for CORS (default: `http://localhost:3000,http://localhost:5678`)
- `TRUST_PROXY`: set `true` if running behind a reverse proxy
- `LOG_LEVEL`: winston log level (default `info`)
- `DATA_DIR`: Actual data directory (default `/app/.actual-cache`); stores `auth.db`
- `N8N_CLIENT_ID` / `N8N_CLIENT_SECRET` / `N8N_OAUTH2_CALLBACK_URL`: enable OAuth2 endpoints when all are present
- `REDIS_URL`: Redis connection URL (e.g., `redis://localhost:6379`) - optional, for distributed rate limiting
- `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD`: Alternative Redis connection (if not using `REDIS_URL`)
- `ENABLE_CORS`: enable/disable CORS (default `true`)
- `ENABLE_HELMET`: enable/disable Helmet security headers (default `true`)
- `ENABLE_RATE_LIMITING`: enable/disable rate limiting (default `true`)
- `MAX_REQUEST_SIZE`: maximum request body size (default `10kb`)

### Development Mode
In development mode (`NODE_ENV=development`), the following relaxations apply:
- Secrets can be shorter (minimum 8 characters recommended)
- Missing secrets are auto-generated with warnings
- Less strict validation for easier local development

See [.env.example](.env.example) for a complete list with descriptions.

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
	- POST `/auth/login` with `{ "username": "admin", "password": "..." }`
	- Response contains `access_token`, `refresh_token`, `expires_in`
	- Send `Authorization: Bearer <access_token>` to protected routes
	- Rate limited: 5 requests per 15 minutes
- n8n OAuth2 (optional):
  - Configure env vars listed above
  - Endpoints available: `/oauth/authorize`, `/oauth/token`
  - Client secrets are hashed with bcrypt before storage
  - See [Connecting n8n](#connecting-n8n) for setup details.

## Query Endpoint

The `/query` endpoint allows executing ActualQL queries against Actual Budget data:
- **Security**: Table whitelist, filter depth limits, result size limits
- **Rate Limited**: 20 requests per minute
- **Audit Logging**: All queries logged with user ID and request context
- **Documentation**: See [ActualQL docs](https://actualbudget.org/docs/api/actual-ql/)

## Connecting n8n
n8n can integrate with the API via OAuth2 for secure token-based workflows. Use either built-in session/JWT auth or the OAuth2 flow. If using in production behind a reverse-proxy like traefik, ensure to replace the `localhost` and other docker hostnames with the correct domains.

### Option 1: Basic Auth or Bearer Token (Quick Start)
For development, you can use manual session login or JWT bearer tokens:

1. Log in via basic auth:
   - Enter credentials in n8n HTTP node with basic auth.

2. Or, obtain a bearer token:
   - POST to `/auth/login` with `{ "username": "admin", "password": "..." }`
   - Copy the `access_token` from the response
   - In n8n, create a credential of type "Generic Credential Type" or similar HTTP auth
   - Set header: `Authorization: Bearer <access_token>`

### Option 2: OAuth2 Flow (Production Recommended)
Set up OAuth2 for secure, refreshable tokens:

1. Configure env vars (already in `.env.local` example above):
   - `N8N_CLIENT_ID`: a unique identifier (e.g., `example-n8n`)
   - `N8N_CLIENT_SECRET`: a long random secret (32+ chars)
   - `N8N_OAUTH2_CALLBACK_URL`: n8n's OAuth callback URL (e.g., `http://localhost:5678/rest/oauth2-credential/callback`)

2. In n8n, add a new credential:
   - Select **OAuth2** type
   - **Authorization URL**: `http://localhost:3000/oauth/authorize`
   - **Token URL**: `http://actual-api-wrapper-dev:3000/oauth/token`
   - **Client ID**: same as `N8N_CLIENT_ID`
   - **Client Secret**: same as `N8N_CLIENT_SECRET`
   - **Redirect URL**: same as `N8N_OAUTH2_CALLBACK_URL`
   - Authorize and use in n8n workflows

3. Test in n8n:
   - Add an HTTP request node
   - Set URL to an API endpoint (e.g., `http://actual-api-wrapper-dev:3000/accounts`)
   - In authentication, select the OAuth2 credential you just created
   - Execute the node

Benefits of OAuth2:
- Tokens are refreshed automatically
- No passwords are stored in n8n
- Tokens can be revoked from the API

### Troubleshooting
- **"Resource not accessible" in n8n**: Check that the API and n8n are on the same network (both in docker-compose).
- **Token expired**: OAuth2 automatically refreshes; session tokens may need manual re-login.
- **CORS error**: Verify `ALLOWED_ORIGINS` includes n8n's origin (e.g., `http://localhost:5678`).

## CLI Commands

### Development (Docker - Recommended)
```bash
# Start all services (API + Actual Server + n8n + Redis)
docker compose -f docker-compose.dev.yml up --build

# Rebuild and restart
docker compose -f docker-compose.dev.yml up --build --force-recreate
```

### Local Development (Advanced)
**Note**: Requires manual environment variable setup. See [Option 2](#option-2-local-development-advanced---requires-manual-setup) above.
- Start: `npm start` (requires all env vars set)
- Dev (watch mode): `npm run dev` (requires all env vars set)

### Testing & Quality
- Test: `npm test`
- Test (watch): `npm run test:watch`
- Test (coverage): `npm run test:coverage`
- Lint: `npm run lint`
- Audit: `npm run audit`
- Validate OpenAPI: `npm run validate:openapi`
- Pre-commit hooks: see [PRECOMMIT_SETUP.md](PRECOMMIT_SETUP.md)

## Docker (Production)
Build and run the image:

```bash
docker build -t actual-api-wrapper:latest .
docker run --rm -p 3000:3000 \
	-v $(pwd)/data/actual-api:/app/.actual-cache \
	--env-file ./.env \
	actual-api-wrapper:latest
```

Or use the compose file:

```bash
docker compose up -d --build
```

## Data & Persistence
- SQLite auth DB: `${DATA_DIR}/auth.db` (persist the `DATA_DIR` volume)
- Actual SDK cache and budget data are managed by `@actual-app/api` using `DATA_DIR`
- Database migrations: Automatic schema migrations on startup (e.g., `client_secret_hashed` column)

## Observability

### Logging
- Structured logs via winston (JSON in production), respect `LOG_LEVEL` and `NODE_ENV`
- Each request includes an `X-Request-ID` for traceability
- Comprehensive error logging with request context

### Metrics
- Metrics endpoint: `GET /metrics` (consider protecting in production)
- Tracks: request counts, response times, error rates, system resources
- In-memory storage (consider Redis for distributed deployments)

### Health Checks
- Health endpoint: `GET /health`
- Checks: database connectivity, Actual API connectivity, system resources
- Returns 200 (healthy) or 503 (degraded) status codes

## CI / Security
GitHub Actions run dependency and image security checks:
- npm audit, ESLint, Docker build test
- Snyk (requires `SNYK_TOKEN` secret)
- Container scan via Trivy (SARIF uploaded to code scanning)
- Secret scanning via Gitleaks
- OWASP Dependency-Check (SARIF upload)

Workflow tips:
- SARIF uploads require `permissions: { security-events: write, actions: read }`
- Forked PRs skip uploads to avoid permission errors

## Project Structure
- App: [src](src)
- Routes: [src/routes](src/routes)
- Auth: [src/auth](src/auth)
- Config: [src/config](src/config) - includes environment validation
- Docs: [src/docs](src/docs)
- Logging: [src/logging](src/logging)
- Errors: [src/errors](src/errors) - custom error classes
- Middleware: [src/middleware](src/middleware) - rate limiting, validation, metrics, etc.
- Tests: [tests](tests) - Jest test suite

## Documentation
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture and design patterns
- [SECURITY.md](SECURITY.md) - Security model and threat analysis
- [.env.example](.env.example) - Complete environment variable reference
