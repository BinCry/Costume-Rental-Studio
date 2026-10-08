---
date: 2026-10-08
session: minimal-authenticated-actor-select
---

# Journal: 2026-10-08 — Minimal Authenticated Actor Select

## Context

The authentication middleware loaded complete user, employee, branch, role, and permission records on every protected request. The goal was to reduce the selected data without changing JWT verification, authorization behavior, API contracts, or database schema.

## What Happened

- Replaced the nested Prisma `include` in authentication middleware with the shared `authenticatedActorSelect`.
- Selected fields from their actual consumers: account and employment status checks, permission evaluation, branch status, and the public `/auth/me` response.
- Kept user profile fields, role metadata, permission code, and scope because `/auth/me` exposes them.
- Derived `AuthenticatedActor` from `typeof authenticatedActorSelect`, keeping the runtime query and TypeScript type aligned.
- Replaced the duplicate customer actor payload with the `CustomerActor = AuthenticatedActor` alias.
- Added coverage for the exact minimal query and verified `/auth/me` still returns its existing user, role, and permission contract.
- Verification completed with 138 tests passing, plus typecheck, lint, and build passing.

## Reflection

This was a low-risk optimization because it reduces transferred columns while preserving the existing database-backed authorization model. Centralizing the select also prevents service-specific actor types from silently drifting away from the middleware payload.

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Use one exported Prisma select for authenticated actors | Runtime data and inferred type stay synchronized | Smaller queries and fewer duplicate actor definitions |
| Retain profile and role-display fields | `/auth/me` consumes them | No API response regression |
| Keep authorization database-backed on every request | Immediate account, role, and branch changes remain effective | No change to permission semantics |
| Defer Redis, auth/permission versioning, and query logging | They require broader operational and schema decisions | No cache, migration, or new infrastructure in this change |

## Next Steps

- Measure production authentication query latency before considering caching.
- Evaluate Redis or permission versioning separately only if measurements show database authorization is a bottleneck.
