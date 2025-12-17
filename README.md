# Actual Budget REST API (Actual Budget API wrapper)

A secure Node.js/Express REST API that wraps the Actual Budget SDK (`@actual-app/api`). It provides JWT-based auth, optional OAuth2 for n8n, Swagger documentation, and a hardened runtime (helmet, CORS, structured logging, rate limits per route).

## Features
- Authentication: JWT access/refresh tokens, session login for docs
- Optional OAuth2: first-party flow for n8n (`/oauth/authorize`, `/oauth/token`)
- Endpoints: accounts, transactions, budgets, categories, payees, rules, schedules, query
- API Docs: protected Swagger UI at `/docs` with OpenAPI source in [src/docs/openapi.yml](src/docs/openapi.yml)
- Security: helmet headers, request IDs, SQLite token revocation, minimal defaults
- Docker: production image + dev `docker compose` stack (Actual Server + n8n)

## Requirements
- Node.js 22+ and npm
- Actual Budget Server credentials (or use the dev `docker compose` stack)
- For OAuth2 to n8n (optional): n8n instance and client credentials
- For production: dotenvx CLI and encrypted `.env` file with `DOTENV_PRIVATE_KEY`

## Development
`npm run dev` works locally when Actual Server is running and all required env vars are set. Choose one approach below.

### Option 1: Docker Dev Stack (Full-featured, Simplest for Local Testing)
Bring up all services (API + Actual Server + n8n) with automatic rebuilds on code changes:

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
ADMIN_PW=ChangeMe_very_strong!
JWT_SECRET=replace-with-64b-random
JWT_REFRESH_SECRET=replace-with-64b-random

ACTUAL_SERVER_URL=http://actual-server-dev:5006
ACTUAL_PASSWORD=<the password you set in Actual Server>
ACTUAL_SYNC_ID=<your budget sync id>

# Optional n8n OAuth2
N8N_CLIENT_ID=example-n8n
N8N_CLIENT_SECRET=replace-with-long-secret
N8N_OAUTH2_CALLBACK_URL=http://localhost:5678/rest/oauth2-credential/callback
```

Then restart the API container (or re-run the compose command) so it picks up `.env.local`.

Ports:
- API: http://localhost:3000
- n8n: http://localhost:5678
- Actual Server: http://localhost:5006

### Option 2: Host Dev with Docker Actual Server (Hot Reload, Faster Iteration)
Run Actual Server in Docker; run the API on your host with live reload (no rebuild needed):

1. Start Actual Server only:

```bash
docker compose -f docker-compose.dev.yml up -d actual-server
```

2. Set env vars locally and run the API:

```bash
export ADMIN_PW=ChangeMe_very_strong!
export JWT_SECRET=replace-with-64b-random
export JWT_REFRESH_SECRET=replace-with-64b-random
export ACTUAL_SERVER_URL=http://localhost:5006
export ACTUAL_PASSWORD=<actual password>
export ACTUAL_SYNC_ID=<budget sync id>
export ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5678
npm ci
npm run dev
```

Benefits: code changes reload instantly via Node 22 `--watch`; no rebuilds needed.

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
dotenvx new

# Encrypt your production .env
dotenvx set ADMIN_PW "your-production-password"
dotenvx set JWT_SECRET "your-production-jwt-secret"
# ... repeat for other required vars
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
- `ADMIN_USER`: admin username (default `admin`)
- `ADMIN_PW`: required; admin password (validated for complexity)
- `SESSION_SECRET`: required in production (random in dev if omitted)
- `JWT_SECRET`: required; HMAC secret for access tokens
- `JWT_REFRESH_SECRET`: required; HMAC secret for refresh tokens
- `JWT_ACCESS_TTL`: optional, default `1h` (supports `30m`, `3600`, etc.)
- `JWT_REFRESH_TTL`: optional, default `24h`
- `PORT`: server port (default `3000`)
- `ALLOWED_ORIGINS`: CSV of allowed origins for CORS
- `TRUST_PROXY`: set `true` if running behind a reverse proxy
- `LOG_LEVEL`: winston log level (default `info`)
- `DATA_DIR`: Actual data directory (default `/app/.actual-cache`); stores `auth.db`
- `ACTUAL_SERVER_URL`: Actual server URL (e.g., `http://localhost:5006`)
- `ACTUAL_PASSWORD`: Actual server password
- `ACTUAL_SYNC_ID`: Budget sync ID
- `N8N_CLIENT_ID` / `N8N_CLIENT_SECRET` / `N8N_OAUTH2_CALLBACK_URL`: enable OAuth2 endpoints when all are present

## API Docs & Validation
- OpenAPI source: [src/docs/openapi.yml](src/docs/openapi.yml)
- Local docs (auth required): GET `/docs`
- Validate OpenAPI:

```bash
npm run validate:openapi
```

## Auth Flows
- Local login (session for docs):
	- GET `/login` → render form
	- POST `/login` → create session, then access `/docs`
- JWT login:
	- POST `/auth/login` with `{ "username": "admin", "password": "..." }`
	- Response contains `access_token`, `refresh_token`, `expires_in`
	- Send `Authorization: Bearer <access_token>` to protected routes
- n8n OAuth2 (optional):
  - Configure env vars listed above
  - Endpoints available: `/oauth/authorize`, `/oauth/token`
  - See [Connecting n8n](#connecting-n8n) for setup details.

## Connecting n8n
n8n can integrate with the API via OAuth2 for secure token-based workflows. Use either built-in session/JWT auth or the OAuth2 flow.

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
- Lint: `npm run lint`
- Audit: `npm run audit`
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

## Observability
- Structured logs via winston (JSON in production), respect `LOG_LEVEL` and `NODE_ENV`
- Each request includes an `X-Request-ID` for traceability

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
- Config: [src/config](src/config)
- Docs: [src/docs](src/docs)
- Logging: [src/logging](src/logging)
