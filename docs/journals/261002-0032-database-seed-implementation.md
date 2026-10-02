---
date: 2026-10-02
session: database-seed-implementation
---

# Journal: 2026-10-02 — Database Seed Implementation

## Context

The Prisma schema and initial migration existed, but local development had no repeatable baseline or representative business data. The goal was a safe seed path that supports development and Prisma Studio without making demo records the production default.

## What Happened

- Added a Prisma seed entry point plus separate `core` and `demo` profiles. Core creates branches, the admin identity, RBAC, and policy versions; demo adds staff, customers, catalog, inventory, transfers, rental states, finance, CRM, audit, webhook, and processed outbox examples.
- Made reruns deterministic with stable UUIDs and `upsert` keys. Relative business dates derive from `SEED_ANCHOR_DATE` or the current Vietnam date.
- Wrapped core and demo work in one Prisma transaction so a failed scenario cannot leave a partially seeded database.
- Registered the seed command in Prisma and workspace scripts, included Prisma scripts in TypeScript/ESLint coverage, and documented local usage and environment controls.
- Review found three operational risks and fixed them: demo data could be selected accidentally in production, multi-stage writes could partially succeed, and moving dates could make fixtures stale or non-repeatable. The result defaults production to `core`, requires an explicit override for production demo data, uses transaction atomicity, and supports a fixed anchor date.

## Reflection

Scenario-based fixtures are more useful than isolated rows because they exercise real relationships and lifecycle states. Stable IDs and upserts keep the seed practical for daily development, while the production guard makes the safer behavior the default. Database execution still depends on an available migrated PostgreSQL instance, so static checks do not replace an integration run.

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Split `core` and `demo` profiles | Separate required reference data from disposable development scenarios | Production defaults to a small, controlled baseline; development remains representative |
| Guard demo seeding in production | Prevent accidental insertion of fake operational and financial data | `ALLOW_PRODUCTION_DEMO_SEED=true` is required for an intentional production-like demo run |
| Seed inside one transaction | Preserve cross-table consistency across a large dependency graph | Any failure rolls back the complete run |
| Use deterministic IDs and upserts | Allow repeatable synchronization without duplicate seed records | Reruns update known fixtures and keep foreign-key references stable |
| Anchor relative dates | Keep active promotions, rentals, and CRM scenarios useful over time | Tests can pin `SEED_ANCHOR_DATE`; local runs can follow Vietnam time |

## Verification

- Typecheck, ESLint, Prisma validation, production builds, and all 8 existing API tests passed.
- `pnpm db:seed` generated Prisma Client and seeded the migrated PostgreSQL database repeatedly with stable counts.
- Read-only integrity queries found no branch/staff, order/unit, accessory/model, transfer-location, refund-owner, or orphan relationship mismatches.
- All 32 models contain representative data; demo outbox fixtures are already `PROCESSED`.

## Next Steps

- Use the seeded scenarios while implementing the catalog, rental, payment, inventory, and CRM repositories and API modules.
