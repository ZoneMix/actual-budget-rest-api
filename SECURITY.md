# Security

## Threat model

This wrapper holds one thing worth stealing: a complete personal ledger, plus
the credentials to the Actual server behind it. It is designed to run on a
private network, not on the open internet.

**Assumed:** the deployment sits behind a network boundary — a tailnet, a VPN,
or a reverse proxy that authenticates before the request arrives. The reference
deployment is tailnet-only with Authentik forward-auth in front.

**Defended against:** a caller who has reached the port. Every `/v2` route
requires a bearer token; a token scoped `read` cannot write; a token without
`admin` cannot load a different budget, export the ledger or manage OAuth
clients. Bad input is rejected by a Zod schema before it reaches the engine, and
`POST /v2/query` is restricted to a table whitelist with depth and result caps.

**Not defended against:** anyone holding a valid admin token, or with write
access to the host. There is no per-record authorization — the ledger is single-
tenant, and any `write` token can change any transaction.

**Explicitly out of scope:** exposing this on the public internet without a
proxy that authenticates first. The rate limits below slow an attacker down;
they are not an authentication layer.

## Authentication and authorization

Three credential types, deliberately separate:

| Credential | Issued by | Used for |
|---|---|---|
| JWT access + refresh token | `POST /v2/auth/login`, or the OAuth2 token endpoint | Every `/v2` route |
| Browser session cookie | `POST /login` | `/admin` dashboard and `/docs` only |
| OAuth2 client credential | Created through the admin API | Third-party integrations such as n8n |

Scopes nest: `read` ⊂ `write` ⊂ `admin`. The legacy scope `api` expands to
`read` + `write`. Tokens for an admin user carry `api,admin`.

`AUTH_SCOPE_ENFORCEMENT` stages the rollout. Under the shipped default `warn` a
scope denial is logged as `auth:SCOPE_WOULD_DENY` and the request proceeds;
under `enforce` it is a 403. **Admin-only operations do not take part in that
rollout** — loading a budget file, exporting the ledger, resetting metrics and
every `/admin` route check the admin scope directly and answer 403 in every
mode, because a `warn`-mode fall-through on those is not a warning, it is the
breach.

Being an admin user is not sufficient: the token must also carry the `admin`
scope. An admin who deliberately mints a narrow token through an api-only OAuth
client gets 403, which is the point of minting it.

JWTs are pinned on both sign and verify by `JWT_ISSUER` and `JWT_AUDIENCE`.
Refresh tokens keep the scope they were granted; they cannot widen it. OAuth2
grants are intersected with both the client's `allowed_scopes` and the user's
own scopes, so a client cannot receive more than either side allows.

Revocation is checked on every request, so logout takes effect immediately
rather than at token expiry.

## What is deliberately not exposed

`importBudget` has no route. Importing replaces the entire ledger the wrapper is
serving — a single call would discard the budget every other caller is reading,
with no undo. It exists in `src/services/actual/files.js` only so its call shape
stays pinned by tests. `ENABLE_BUDGET_IMPORT` is reserved as the flag that would
gate a future route; it is not read by anything today.

`POST /v2/budget/export` is the supported direction and is admin-only.

## Rate limits

Per route class, per minute unless noted: login 5 per 15 minutes, deletes 10,
category groups 20, ActualQL queries 20, admin operations 20, ordinary writes
30, bulk transaction operations 50, budget edits 60, transaction updates 100.
With Redis configured the counters are shared across instances; without it they
are per-process, which is wrong as soon as more than one instance runs.

## Automated scanning

`.github/workflows/security.yml` runs on every push and pull request, and
weekly on Sunday:

- **npm audit** — production dependencies at `--audit-level=high` block the
  build; the full tree at `moderate` is reported but does not.
- **ESLint** with `eslint-plugin-security`.
- **gitleaks** over full history, for credentials committed at any point.
- **Trivy** against the built container image, `CRITICAL,HIGH`,
  `ignore-unfixed`, failing the job and uploading SARIF to code scanning.

Every GitHub Action is pinned to a full commit SHA, kept current by Dependabot.
No workflow pipes a remote installer into a shell.

## Reporting a vulnerability

This is a personal project. Open a private security advisory on
`github.com/ZoneMix/actual-budget-rest-api`, or contact the maintainer directly.
Please do not open a public issue for anything exploitable.

## Rotating a leaked secret

If `JWT_SECRET` or `JWT_REFRESH_SECRET` leaks, replace it and restart. Every
issued token stops verifying, which is the desired outcome. If `SESSION_SECRET`
leaks, replace it; active dashboard sessions end.

If `ACTUAL_PASSWORD` or `ACTUAL_FILE_PASSWORD` leaks, change it on the Actual
server first, then in the wrapper's environment. If `ADMIN_PASSWORD` leaks,
change it and revoke outstanding refresh tokens.

Removing a committed `.env` with `git rm --cached` does not remove it from
history. Treat every secret in that file as public and rotate all of them.
