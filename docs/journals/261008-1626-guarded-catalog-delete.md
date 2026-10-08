---
date: 2026-10-08
session: guarded-catalog-delete
---

# Journal: 2026-10-08 — Guarded Catalog Delete

## Context

Catalog supported deactivation but lacked explicit delete endpoints. The goal was to allow permanent deletion only for unused records while preserving catalog relationships, media, inventory, and rental history.

## What Happened

- Added `DELETE` endpoints for categories, models, variants, and accessories, returning `204` when deletion succeeds.
- Added transactional service guards with the shared catalog advisory lock plus row-level `FOR UPDATE` locking.
- Added dependency checks before deletion:
  - Category: child categories and models.
  - Model: variants, accessories, and media.
  - Variant: costume units, rental order items, and media.
  - Accessory: rental item accessory snapshots.
- In-use records return `409` with a domain-specific `*_IN_USE` code and guidance to deactivate instead.
- Added route/service tests for successful deletion, missing records, and every guarded dependency; documented all four operations in OpenAPI.
- Added PostgreSQL integration coverage for guarded deletion and a concurrent category-delete/child-create race.
- Hardened the PostgreSQL test bootstrap so it requires `DATABASE_TEST_URL` and never falls back to the production `DATABASE_URL`.

## Reflection

Explicit application guards are necessary even where foreign keys already reject deletion: they produce stable API errors and protect relations such as accessory snapshots whose database relation uses `SET NULL`. Serializing catalog hierarchy writes also closes the gap between checking dependencies and deleting the parent.

After explicit authorization, the PostgreSQL suite was run once against the production database with uniquely prefixed fixtures and an immediate cleanup audit. All 8 integration/concurrency tests passed, and the post-run audit found zero test users, branches, policies, orders, or models remaining. A dedicated `DATABASE_TEST_URL` remains the normal and safer default for future runs.

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Do not cascade physical deletion | Children and business history must not disappear when a parent is removed | Only leaf, unused records can be deleted |
| Return `409` for used records | A conflict clearly distinguishes business-state rejection from invalid input | Clients can direct users to the inactive workflow |
| Use transaction, advisory lock, and row lock | Dependency checks and deletion must be serialized with catalog mutations | Concurrent creation cannot bypass the delete guard |
| Require a dedicated test database URL | The repository `.env` points at production | PostgreSQL mutation tests fail safely instead of touching production |

## Next Steps

- Provision an isolated PostgreSQL database for repeatable future integration runs.
- Commit and deploy the verified API changes.
