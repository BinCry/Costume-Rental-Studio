---
date: 2026-10-08
session: catalog-consistency-fixes
---

# Catalog consistency fixes — 2026-10-08

## Context

Correct shared-catalog authorization, employee eligibility, and media registration consistency across API instances.

## What happened

- Branch-bound roles can use the shared `catalog:read` permission with `ALL` scope only when their assigned branch is active. The exception is limited to catalog reads; other `ALL` permissions still require a global assignment.
- Authentication and permission checks reject employees whose employment status is not `ACTIVE`, including `ON_LEAVE`, immediately on subsequent requests even with an existing token.
- Nullable, unique `source_upload_key` records the original staging key and prevents duplicate registration. Media responses omit this internal field.
- An owner row lock using `FOR UPDATE` protects the count and insert in one transaction, enforcing image limits across API instances.
- PATCH normalizes `modelCode` and `variantCode` to uppercase, matching create behavior.
- Deactivating a category locks and deactivates its full category/model/variant/accessory subtree in one transaction. Descendant creation and activation lock and recheck their parent so concurrent writes cannot leave an active child below an inactive parent. Reactivating a category does not reactivate descendants.

## Reflection

The regular API suite reports 122 passing tests; API typecheck, lint, build, and Prisma schema validation also pass. The explicit PostgreSQL suite reports 6 passing tests against the database configured in `apps/api/.env`, covering concurrent image limits, duplicate finalize, category cascade, create-versus-deactivate races for models and nested categories, and reparent-versus-reactivate safety. Storage is mocked in that suite so the checks focus on PostgreSQL locking and uniqueness.

## Decisions

Use database uniqueness for upload replay protection and shared owner row locks for image limits. Keep storage operations outside the lock transaction to limit lock duration.

## Next steps

Migration `20261008020000_media_finalize_identity` was applied successfully to the PostgreSQL database configured in `apps/api/.env`. Run `pnpm --filter @costume/api test:postgres` whenever validating the same migration and locking behavior against another deployment database.
