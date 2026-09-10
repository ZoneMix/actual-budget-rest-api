# Architecture Documentation

## Overview

This REST API wraps the Actual Budget SDK (`@actual-app/api`) to provide a secure, production-ready HTTP interface for budget management. The architecture follows a layered, modular design with clear separation of concerns.

## System Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                      Client Applications                      │
│              (n8n, Web Apps, Mobile Apps, etc.)               │
└───────────────────────────┬───────────────────────────────────┘
                            │
                            │ HTTP/HTTPS
                            │
┌───────────────────────────▼───────────────────────────────────┐
│                    Express Application                        │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  Middleware Layer                                      │   │
│  │  - Request ID, CORS, Helmet, Rate Limiting, Metrics    │   │
│  └────────────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  Route Layer                                           │   │
│  │  - Authentication, Accounts, Transactions, etc.        │   │
│  └────────────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  Service Layer                                         │   │
│  │  - Actual API wrapper, Business logic                  │   │
│  └────────────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  Data Layer                                            │   │
│  │  - PostgreSQL/SQLite (auth), Actual SDK (budget data)  │   │
│  └────────────────────────────────────────────────────────┘   │
└───────────────────────────┬───────────────────────────────────┘
                            │
                            │
┌───────────────────────────▼───────────────────────────────────┐
│              External Services                                │
│  - Actual Budget Server (via @actual-app/api)                 │
│  - Redis (optional, for distributed rate limiting)            │
│  - Grafana (development monitoring & visualization)           │
└───────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
src/
├── app.js             # Builds the Express app (middleware + mounts), no listener
├── server.js          # Process bootstrap: listen, startup, graceful shutdown
├── auth/              # Authentication & authorization
│   ├── jwt.js               # Sign, verify, revoke; issuer/audience pinning
│   ├── user.js              # User authentication
│   ├── scopes.js            # The scope lattice: read ⊂ write ⊂ admin, `api` expansion
│   ├── permissions.js       # requireScope / requireScopeByMethod / requireAdminRole
│   ├── adminApi.js          # Admin API authentication (JWT or session)
│   ├── adminDashboard.js    # Admin dashboard session auth
│   ├── docsAuth.js          # /docs access control
│   └── oauth2/              # OAuth2: client, code, grants, scope intersection
├── config/            # Configuration management
│   ├── index.js      # Main config exports
│   ├── env.js        # Environment variable validation (Zod, fails fast)
│   ├── swagger.js    # OpenAPI loader; injects info.version from package.json
│   └── redis.js      # Redis connection management
├── db/                # Database layer
│   └── authDb.js     # PostgreSQL/SQLite authentication database
├── docs/              # OpenAPI documentation
│   ├── openapi.yml   # Root spec: path table + component registry
│   ├── paths/        # One file per resource
│   └── components/   # Shared schemas and securitySchemes
├── errors/            # Custom error classes
│   └── index.js      # Error type definitions
├── logging/           # Logging infrastructure
│   └── logger.js     # Winston logger configuration
├── middleware/        # Express middleware
│   ├── asyncHandler.js      # Async error handling
│   ├── bodyParser.js        # Per-route body size limits (bulk larger, query smaller)
│   ├── errorHandler.js      # Global error handler
│   ├── metrics.js           # Metrics collection
│   ├── queryExpressions.js  # ActualQL expression mapping
│   ├── querySecurity.js     # Table whitelist, filter depth, result cap
│   ├── rateLimiters.js      # Rate limiting configs
│   ├── requestId.js         # Request ID tracking
│   ├── responseHelpers.js   # sendSuccess / sendCreated
│   └── validation-schemas.js # Re-export shim for validation/ (removed in 3.0.0)
├── validation/        # Zod schemas, one file per domain
│   ├── index.js      # Barrel + validateBody / validateParams / validateQuery
│   ├── common.js     # Shared pieces: IDSchema, UuidSchema, atLeastOneKey, ...
│   ├── constants.js  # Every enum literal, pinned against the SDK by tests
│   ├── errors.js     # Zod error → API error-detail formatting
│   └── ... (accounts, transactions, rules, schedules, budgets, query, ...)
├── public/            # Static files
│   └── static/        # CSS, HTML for login and admin pages
├── routes/            # Express route handlers — thin: validate, call, respond
│   ├── accounts.js          # Also mounts transactions-nested at :accountId
│   ├── health.js            # Thin assembler over health-checks.js
│   ├── health-checks.js     # The probes themselves
│   ├── query.js             # ActualQL endpoint (read scope, over POST)
│   └── ... (one router per resource)
└── services/          # Business logic layer
    ├── actualApi.js  # Re-exports actual/ (the import path routes use)
    └── actual/       # Actual Budget API wrapper, split by domain
        ├── client.js      # init / get / shutdown / budget recovery
        ├── queue.js       # FIFO engine queue (backpressure, timeout, reentrancy)
        ├── syncPolicy.js  # interval gate deciding when a read must sync
        ├── runner.js      # runWithApi(label, fn, { mode, force }) + metrics
        ├── index.js       # barrel
        └── ... (accounts, transactions, categories, payees, budgets, ...)
```

The engine wrapper is the part worth understanding. `@actual-app/api` is a
stateful singleton that owns an on-disk cache, so it cannot be called
concurrently. Everything funnels through `runner.js`:

- **`queue.js`** serialises every call. Beyond `ACTUAL_QUEUE_MAX_DEPTH` pending
  operations it rejects with 503 rather than growing without bound; past
  `ACTUAL_OP_TIMEOUT_MS` the caller gets 504 while the operation keeps its slot,
  since the SDK call cannot be cancelled.
- **`syncPolicy.js`** decides whether a read syncs first. A read syncs only if
  the last successful sync is older than `ACTUAL_SYNC_MIN_INTERVAL_MS`; writes
  always sync afterwards and mark the policy fresh. `forceStale()` exists for
  the one case that invalidates freshness without a write — loading a different
  budget file, where the recorded freshness was measured against a file that is
  no longer open.
- **`runner.js`** ties them together: `runWithApi(label, fn, { mode, force })`
  takes the queue slot, applies the sync policy for the mode, and records
  timing metrics under the label.

Health probes deliberately bypass all of this. `/v2/health` is unauthenticated,
so routing it through the queue would let an anonymous caller drive outbound
sync traffic and make health latency a function of queue depth. It calls the
engine instance directly instead.

## Request Flow

### 1. Request Entry
```
Client Request
    ↓
Request ID Middleware (adds X-Request-ID)
    ↓
Metrics Middleware (tracks request stats)
    ↓
Security Middleware (Helmet, CORS)
    ↓
Body Parser (size limits)
    ↓
Route Handler
```

### 2. Authentication Flow

**JWT Authentication:**
```
Request with Authorization: Bearer <token>
    ↓
authenticateJWT middleware
    ↓
Verify token signature
    ↓
Check token revocation (PostgreSQL/SQLite)
    ↓
Extract user role and scopes from token
    ↓
Attach user (with role/scopes) to req.user
    ↓
Route handler (can check permissions)
```

**OAuth2 Flow:**
```
GET /oauth/authorize
    ↓
Validate client_id, redirect_uri
    ↓
Check session (redirect to /login if needed)
    ↓
Generate authorization code
    ↓
Redirect to callback with code
    ↓
POST /oauth/token
    ↓
Validate code, exchange for tokens
    ↓
Return access_token + refresh_token
```

**Admin API Flow:**
```
Request to /admin/*
    ↓
authenticateAdminAPI middleware
    ↓
Try JWT authentication OR session authentication
    ↓
Require BOTH: user role is admin AND the token's expanded scopes include admin
    ↓
If not: 403 Forbidden — in every AUTH_SCOPE_ENFORCEMENT mode
    ↓
If admin: Continue to route handler
    ↓
Admin route handler (OAuth client management)
```

The scope half of that check matters: an admin user can deliberately mint a
narrow token through an api-only OAuth client, and that token must not open the
admin surface. `isAdmin` therefore reads the expanded grant, not the role alone.
Session paths are unaffected — `authenticateAdminAPI` builds its user from the
database row, where an admin carries `api,admin`.

### 3. Route Handler Flow

```
Route Handler
    ↓
Rate Limiter (per route class)
    ↓
authenticateJWT  →  requireScopeByMethod() / requireScope(SCOPES.READ)
    ↓                (GET/HEAD/OPTIONS → read, everything else → write;
    ↓                 /v2/query names read explicitly, being a read over POST)
Validation Middleware (validateParams / validateQuery / validateBody, Zod)
    ↓
Service Layer (src/services/actual/*)
    ↓
runWithApi → queue slot → sync policy → @actual-app/api call
    ↓
Response Helper (sendSuccess / sendCreated)
    ↓
Client Response
```

Handlers read `req.validatedBody`, `req.validatedParams` and
`req.validatedQuery` — never `req.body` directly. The validated objects are new
objects produced by Zod, so a schema's coercions and alias folding (`offBudget`
→ `offbudget`, `_date` → `date`) apply without mutating the request.

### 4. Error Handling Flow

```
Error thrown in route handler
    ↓
asyncHandler catches it
    ↓
Passes to errorHandler middleware
    ↓
Log error with context
    ↓
Format error response
    ↓
Return to client
```

## Data Flow

### Authentication Data
```
PostgreSQL or SQLite Database (auth.db or PostgreSQL)
├── users (username, password_hash, role, scopes, is_active, created_at, updated_at)
├── tokens (jti, token_type, revoked, expires_at, issued_at)
├── clients (client_id, client_secret [hashed], client_secret_hashed, allowed_scopes, redirect_uris)
└── auth_codes (code, client_id, user_id, redirect_uri, scope, expires_at)
```

**Database Selection:**
- **PostgreSQL** (recommended for production): Set `DB_TYPE=postgres`, supports connection pooling, better for distributed deployments
- **SQLite** (default): Set `DB_TYPE=sqlite`, simpler setup, sufficient for single-instance deployments
- Automatic schema migrations on startup (adds role, scopes, updated_at columns)

### Budget Data
```
Actual Budget SDK
├── Local cache (DATA_DIR)
│   ├── budget files
│   └── metadata
└── Remote sync (ACTUAL_SERVER_URL)
    └── Budget synchronization
```

## Key Design Patterns

### 1. **Layered Architecture**
- **Routes**: HTTP request/response handling
- **Services**: Business logic and external API calls
- **Data Layer**: Database and external service access

### 2. **Middleware Chain**
- Request flows through middleware in order
- Each middleware adds/modifies request/response
- Error middleware catches all errors

### 3. **Dependency Injection**
- Services are imported and used directly
- No complex DI framework (keeps it simple)
- Easy to test with mocks

### 4. **Error Handling**
- Custom error classes for different error types
- Centralized error handler middleware
- Consistent error response format

### 5. **Configuration Management**
- Environment variables validated on startup
- Single source of truth (config/env.js)
- Type-safe configuration

## Security Architecture

### Authentication Layers
1. **Session-based**: For web UI (docs, login page, admin dashboard)
2. **JWT-based**: For API access (access + refresh tokens with role/scopes)
3. **OAuth2**: For third-party integrations (n8n)

### Authorization (scope-based)
- **Lattice** (`src/auth/scopes.js`): `read` ⊂ `write` ⊂ `admin`. The legacy
  scope `api` expands to `read` + `write`. Expansion happens once, at check time.
- **Roles**: still stored in the database (`admin`, `user`) and still carried in
  the token, but they gate nothing on their own.
- **Token Claims**: JWTs carry `role` and `scopes`, plus pinned `iss`/`aud`.
- **Admin operations**: require an admin role **and** the `admin` scope.
- **Rollout**: `AUTH_SCOPE_ENFORCEMENT` is `off` / `warn` / `enforce`. The
  shipped default `warn` logs `auth:SCOPE_WOULD_DENY` and lets the request
  through, so no existing caller starts getting 403s mid-upgrade.
- **Outside the rollout**: `requireAdminRole()` — used by the admin routes,
  budget load/export and metrics reset — always enforces. Under `warn` a scope
  gate on those would log a denial and then permit the very operation it was
  protecting.
- **Permission Checks**: `requireScope`, `requireScopeByMethod`,
  `requireAdminRole`, `isAdmin`, `hasScope` in `src/auth/permissions.js`.
- **OAuth2 grants**: intersected with both the client's `allowed_scopes` and the
  authorizing user's own scopes; a refresh keeps the granted scope and cannot
  widen it.

### Security Measures
- **Rate Limiting**: Per-route, with Redis support for distributed systems
- **Input Validation**: Zod schemas for all inputs
- **SQL Injection Protection**: Parameterized queries (works with both PostgreSQL and SQLite)
- **Secret Hashing**: bcrypt for passwords and OAuth client secrets (12 rounds)
- **Token Revocation**: Database tracking of revoked tokens (PostgreSQL/SQLite)
- **CORS**: Whitelist-based origin control
- **Helmet**: Security headers
- **Request ID**: Traceability for debugging
- **Open Redirect Protection**: Validated redirect URLs
- **Query Security**: Table whitelist, filter depth limits, sanitized logging
- **Session Security**: HttpOnly, Secure, SameSite cookies
- **Error Information Disclosure**: Production hides internal error details
- **Database Abstraction**: Unified interface for PostgreSQL and SQLite (automatic placeholder conversion)

## Rate Limiting Strategy

### Storage Backend
- **Memory Store**: Default, works for single instance
- **Redis Store**: Optional, for distributed deployments
- Automatic fallback if Redis unavailable

### Rate Limits by Operation Type
- **Login**: 5 requests / 15 minutes (very strict)
- **Delete**: 10 requests / minute
- **Standard Write**: 30 requests / minute
- **Bulk Operations**: 50 requests / minute
- **Query**: 20 requests / minute (security)
- **High Frequency**: 100 requests / minute

## Actual Budget Integration

### Sync Strategy

Governed by `src/services/actual/syncPolicy.js`, not by each call site.

- **Reads**: sync only when the last successful sync is older than
  `ACTUAL_SYNC_MIN_INTERVAL_MS` (default 5000). A read may therefore return data
  up to that interval stale. `0` restores sync-before-every-read.
- **Writes**: always sync afterwards, and mark the policy fresh — so a write
  followed by a read is consistent regardless of the interval.
- **Forced stale**: `POST /v2/budget/load` calls `forceStale()`, because the
  recorded freshness was measured against a budget file that is no longer open.
- **On demand**: `POST /v2/sync` syncs immediately, ignoring the interval.
- **Initialization**: the budget is downloaded on startup.
- **Failures**: a sync error is recorded as `lastSyncError` and surfaced by
  `/v2/health`. Health probes do not sync, so polling health cannot erase the
  diagnostic it exists to report.

### API Wrapper Pattern
```javascript
runWithApi(label, fn, { syncBefore, syncAfter })
```
- Wraps all Actual API calls
- Handles sync logic
- Logs operation duration
- Manages API instance lifecycle

## Error Handling Strategy

### Error Types
- `ValidationError` (400): Invalid input
- `AuthenticationError` (401): Auth failed
- `AuthorizationError` (403): Insufficient permissions
- `NotFoundError` (404): Resource not found
- `ConflictError` (409): Resource conflict
- `RateLimitError` (429): Too many requests
- `InternalServerError` (500): Server errors

### Error Response Format
```json
{
  "error": "Error message",
  "requestId": "uuid",
  "code": "ERROR_CODE",
  "details": { ... }  // Only in development
}
```

## Logging Strategy

### Structured Logging
- Winston logger with JSON format in production
- Human-readable format in development
- Request ID in all logs for traceability

### Log Levels
- **error**: Errors and exceptions
- **warn**: Warnings and client errors
- **info**: General information (default)
- **debug**: Detailed debugging (development only)

### Security Logging
- Authentication events (login, logout, token refresh)
- Suspicious activity (revoked token use, invalid tokens)
- Rate limit violations
- All queries (audit trail)

## Metrics Collection

### Collected Metrics
- Request count (total, by method, by route)
- Response times (average, distribution)
- Error rates (by status code)
- System resources (memory, uptime)

### Metrics Endpoints
- `GET /metrics`: Full metrics snapshot in JSON format
- `GET /metrics/summary`: Lightweight summary metrics
- `POST /metrics/reset`: Reset metrics counters (requires auth in production)
- Protected in production, open in development for easier testing

### Grafana Integration (Development)

Grafana is pre-configured in the development Docker Compose stack for real-time metrics visualization:

- **Service**: Runs on port 3001 in development
- **Data Source**: JSON API datasource connecting to `/metrics` endpoint
- **Dashboard**: Pre-configured dashboard with 6 visualization panels:
  - Total requests (time series)
  - Error rate (gauge)
  - Average response time (gauge)
  - Requests by HTTP method (pie chart)
  - Requests by route (table)
  - Errors by status code (table)
- **Auto-refresh**: Dashboard updates every 10 seconds
- **Configuration**: Provisioned via `grafana/provisioning/` directory

See [monitoring/README.md](monitoring/README.md) for setup and customization details.

## Scalability Considerations

### Single Instance
- Works with in-memory rate limiting
- SQLite for auth (sufficient for most use cases)
- No external dependencies required

### Distributed Deployment
- **PostgreSQL**: Recommended for production (connection pooling, better concurrency)
- **Redis**: Shared rate limiting state
- Multiple instances can share rate limit counters and database
- Stateless API design (JWT tokens with role/scopes)

### Performance Optimizations
- Read operations skip sync (faster)
- Prepared statements (SQLite) / Parameterized queries (PostgreSQL)
- Connection pooling (PostgreSQL pool, Actual SDK handles its own)
- Request size limits prevent DoS
- Async database operations (PostgreSQL) for better concurrency

## Testing Strategy

### Test Structure
```
tests/
├── middleware/        # Middleware unit tests
│   ├── errorHandler.test.js
│   └── validation-schemas.test.js
├── routes/           # Route integration tests
│   └── auth.test.js
└── setup.js          # Test environment configuration
```

### Test Framework
- **Jest**: Test runner with ESM support
- **Supertest**: HTTP assertion library for route testing
- **Coverage**: Configured with 70% threshold

### Running Tests
```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
```

### Test Coverage Goals
- **Unit Tests**: 70%+ coverage (configured threshold)
- **Integration Tests**: All endpoints
- **Security Tests**: Authentication, authorization, validation

## Deployment Architecture

### Development Stack (Docker Compose)
```
Development Environment
├── actual-rest-api-dev (port 3000)
│   ├── Express API
│   ├── PostgreSQL (auth database, recommended)
│   └── Actual SDK cache
├── actual-server-dev (port 5006)
│   └── Actual Budget Server
├── postgres-dev (port 5432)
│   └── PostgreSQL database
├── redis-dev (port 6379)
│   └── Distributed rate limiting
├── n8n (port 5678)
│   └── Workflow automation
└── grafana (port 3001)
    ├── Metrics visualization
    ├── Pre-configured dashboard
    └── JSON API datasource
```

All services include:
- Health checks for dependency management
- Log rotation (prevents disk space issues)
- Volume mounts for persistent data
- Automatic restart policies

### Production
```
Load Balancer
    ↓
Multiple API Instances
├── PostgreSQL (shared auth database, recommended)
├── Redis (shared rate limiting)
└── Actual Server (external)
```

**Alternative (Single Instance):**
```
Single API Instance
├── SQLite (auth.db, simpler setup)
├── Redis (optional, for rate limiting)
└── Actual Server (external)
```

**Note**: Grafana is development-only. For production monitoring, use:
- Prometheus for metrics collection
- Grafana Cloud or self-hosted Grafana
- Centralized logging (ELK, Loki, etc.)

## Configuration Management

### Environment Variables
- **Validated on startup** using Zod schemas in `src/config/env.js`
- Clear error messages for missing/invalid variables
- Type-safe access throughout application
- **Development mode**: Relaxed requirements, auto-generated secrets
- **Production mode**: Strict validation, all secrets required (32+ chars)

### Configuration Files
- `.env.example`: Template with all variables and descriptions
- `.env.local`: Development overrides (mounted in Docker dev, never committed)
- **Production**: Use secrets managers (GitHub Secrets, AWS Secrets Manager, Kubernetes Secrets, etc.)

### Environment Validation
- All variables validated against Zod schemas
- Production-specific checks (secret uniqueness, length requirements)
- Automatic defaults for development mode
- Exits with clear error messages if validation fails

## Recent Enhancements

### Completed Improvements
1. ✅ **Environment Variable Validation**: Zod-based validation on startup
2. ✅ **Comprehensive Error Types**: Custom error classes for better error handling
3. ✅ **Secure Query Endpoint**: ActualQL validation with table whitelist and restrictions
4. ✅ **Client Secret Hashing**: bcrypt hashing for OAuth2 client secrets
5. ✅ **Improved Health Endpoint**: Database and API connectivity checks
6. ✅ **Metrics Collection**: Built-in metrics middleware and endpoint
7. ✅ **Redis Rate Limiting**: Optional Redis support for distributed rate limiting
8. ✅ **Test Framework**: Jest test suite with ESM support
9. ✅ **Database Migrations**: Automatic schema migration for new columns
10. ✅ **Route-Specific Body Limits**: Different size limits for different operation types
11. ✅ **Grafana Monitoring**: Pre-configured Grafana dashboard for development metrics visualization
12. ✅ **Log Rotation**: Docker log rotation configured for all services
13. ✅ **Security Audit**: Comprehensive security review and fixes (open redirect, OAuth2, query logging)
14. ✅ **Metrics Routes**: Dedicated `/metrics` endpoints with summary and reset capabilities
15. ✅ **Query Security**: Enhanced ActualQL query validation with depth limits and sanitized logging
16. ✅ **PostgreSQL Support**: Full PostgreSQL support with SQLite fallback, unified database abstraction layer
17. ✅ **Role-Based Access Control (RBAC)**: User roles and scopes for fine-grained authorization
18. ✅ **Admin API**: OAuth client management endpoints with web dashboard (`/admin/oauth-clients`)
19. ✅ **Enhanced Token Revocation**: Improved logout flow with refresh token revocation support
20. ✅ **Permission System**: Utilities for checking roles and scopes (`isAdmin`, `hasScope`, `requireScope`)

### Future Enhancements

### Potential Improvements
1. **User Management API**: CRUD endpoints for managing users (beyond admin user)
2. **Multi-User Support**: Support for multiple admin and regular users
3. **Caching Layer**: Redis for frequently accessed data (beyond rate limiting)
4. **Webhook Support**: Notify external systems of changes
5. **GraphQL Endpoint**: Alternative to REST
6. **API Versioning**: Support multiple API versions
7. **Request Batching**: Allow multiple operations in one request
8. **Prometheus Integration**: Native Prometheus metrics format for production
9. **Distributed Tracing**: OpenTelemetry support
10. **Production Grafana**: Set up Grafana for production monitoring
11. **Alert Rules**: Configure Grafana alerts for error rates and performance
12. **Log Aggregation**: Centralized logging solution (ELK, Loki) for production

## Development Tools

### Docker Compose Services
- **actual-rest-api-dev**: Main API service (port 3000)
- **actual-server-dev**: Actual Budget server (port 5006)
- **postgres-dev**: PostgreSQL database (port 5432)
- **redis-dev**: Rate limiting and caching (port 6379)
- **n8n**: Workflow automation (port 5678)
- **grafana**: Metrics visualization (port 3001)

### Monitoring & Observability
- **Metrics**: Built-in collection at `/metrics` endpoint
- **Grafana**: Pre-configured dashboard for development
- **Logging**: Structured logging with Winston, configurable levels
- **Health Checks**: Comprehensive health endpoint with dependency checks

### Configuration Files
- `docker-compose.dev.yml`: Development stack configuration
- `grafana/provisioning/`: Grafana datasource and dashboard provisioning
- `grafana/dashboards/`: Pre-configured dashboard JSON
- `docs/LOGGING.md`: Comprehensive logging configuration guide

## References

- [Actual Budget API Documentation](https://actualbudget.org/docs/api/)
- [ActualQL Query Language](https://actualbudget.org/docs/api/actual-ql/)
- [Express.js Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [OWASP API Security](https://owasp.org/www-project-api-security/)
- [Grafana Documentation](https://grafana.com/docs/grafana/latest/)
- [Docker Logging Drivers](https://docs.docker.com/config/containers/logging/)

