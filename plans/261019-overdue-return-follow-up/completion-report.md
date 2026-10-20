# Completion report — Case 4 overdue-return CRM follow-up

Date: 2026-10-20

## Delivered

- Added structured overdue follow-up fields and an idempotency key to `CustomerInteraction`.
- Added an idempotent Studio CRM operation that derives customer and branch from the rental order and revalidates `ACTIVE` status inside the transaction.
- Added PII-free read/write Agent Tools protected by CRM permissions and `AGENT_CRM_WRITE_ENABLED`.
- Added the authenticated Studio proxy and the AI confirmation-preparation route.
- Added owner, version, analysis, finding, branch, and live-risk checks before freezing the action.
- Reused the existing confirm/reject endpoints, added idempotency readback recovery, and moved successful Case 4 writes to `MONITORING` without resolving the finding.
- Preserved rental status, due date, allocation, unit state, fees, and existing Cases 1–5 behavior.

## Verification

- Studio focused tests: 73 passed.
- Studio full tests: 366 passed, 17 skipped.
- Studio TypeScript typecheck: passed.
- Studio ESLint: passed.
- Studio production build: passed.
- Prisma schema validation: passed.
- AI Case 4 tests: 15 passed.
- AI related route/tool/repository tests: 116 passed.
- AI full tests: 231 passed.
- Ruff and strict mypy: passed.
- `git diff --check`: passed.

## Environment limitation

The Studio PostgreSQL concurrency suite could not start because `DATABASE_TEST_URL` is not configured. All five suites stopped during environment validation before collecting tests. Run `pnpm --filter @costume/api test:postgres` with an isolated PostgreSQL test database before production deployment.

