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
├── auth/              # Authentication & authorization
│   ├── jwt.js        # JWT token management
│   ├── user.js       # User authentication
│   ├── admin.js      # Admin dashboard HTML
│   ├── adminApi.js   # Admin API authentication middleware
│   ├── permissions.js # Role and scope checking utilities
│   ├── oauth2/       # OAuth2 implementation
│   └── docsAuth.js   # Documentation access control
├── config/            # Configuration management
│   ├── index.js      # Main config exports
│   ├── env.js        # Environment variable validation
│   ├── swagger.js    # OpenAPI/Swagger setup
│   └── redis.js      # Redis connection management
├── db/                # Database layer
│   └── authDb.js     # PostgreSQL/SQLite authentication database
├── docs/              # OpenAPI documentation
│   ├── openapi.yml   # Main OpenAPI spec
│   └── paths/        # Route definitions
├── errors/            # Custom error classes
│   └── index.js      # Error type definitions
├── logging/           # Logging infrastructure
│   └── logger.js     # Winston logger configuration
├── middleware/        # Express middleware
│   ├── asyncHandler.js      # Async error handling
│   ├── bodyParser.js        # Body size limits
│   ├── errorHandler.js      # Global error handler
│   ├── metrics.js           # Metrics collection
│   ├── querySecurity.js     # ActualQL query validation
│   ├── rateLimiters.js      # Rate limiting configs
│   ├── requestId.js         # Request ID tracking
│   ├── responseHelpers.js   # Response utilities
│   └── validation-schemas.js # Zod validation schemas
├── public/            # Static files
│   └── static/        # CSS, HTML for login page
├── routes/            # Express route handlers
│   ├── accounts.js
│   ├── auth.js
│   ├── admin.js      # Admin API routes (OAuth client management)
│   ├── budgets.js
│   ├── metrics.js    # Metrics endpoints
│   ├── query.js      # ActualQL query endpoint
│   └── ... (other routes)
├── services/          # Business logic layer
│   └── actualApi.js  # Actual Budget API wrapper
└── server.js         # Application entry point
```

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
Check user has admin role OR admin scope
    ↓
If not admin: 403 Forbidden
    ↓
If admin: Continue to route handler
    ↓
Admin route handler (OAuth client management)
```

### 3. Route Handler Flow

```
Route Handler
    ↓
Rate Limiter (if applicable)
    ↓
Validation Middleware (Zod schemas)
    ↓
Business Logic (Service Layer)
    ↓
Actual API Call (with sync if needed)
    ↓
Response Helper (format response)
    ↓
Client Response
```

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

### Authorization (Role-Based Access Control)
- **Roles**: User roles stored in database (`admin`, `user`)
- **Scopes**: Fine-grained permissions (comma-separated, e.g., `api`, `admin`)
- **Token Claims**: JWT tokens include `role` and `scopes` for authorization
- **Admin API**: Requires `admin` role or `admin` scope
- **Permission Checks**: Middleware utilities (`isAdmin`, `hasScope`, `requireScope`)

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
- **Read Operations**: No sync (faster, eventual consistency)
- **Write Operations**: Sync before and after (data consistency)
- **Initialization**: Download budget on startup

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

See [grafana/README.md](../grafana/README.md) for setup and customization details.

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

