---
date: 2026-10-20
scope: case-6-unit-schedule-conflict
status: implemented
---

# Case 6 — Unit schedule conflict

## Context

Case 6 closes the gap between synchronous availability guards and records introduced by legacy data, imports or concurrent failure paths.

## What happened

- Added `UNIT_SCHEDULE_CONFLICT/v1` across Studio internal finding contracts and the AI Agent API/model contracts.
- Detects overlaps using persisted protected intervals `occupiedFrom` and `occupiedUntil`, with canonical primary/affected ordering by `plannedStartAt` then order id.
- Reused the readiness queue, claim, authorization, confirmation snapshot, `reallocate_rental_item` and read-back paths.
- Adds AI migration `013_unit_schedule_conflict.sql`, registered by `migrate_knowledge.py`.
- Added deterministic replacement recommendation for `CONFIRMED` primary allocations; an `ACTIVE` primary or no same-variant replacement is handoff-only.

## Decisions

- No new role, workforce model or feature flag: Case 6 runs under existing readiness detection/analysis/execution flags.
- Agent never changes rental dates, cancels an order, changes price/payment data or substitutes another variant.
- Production activation requires both Studio and AI migrations and the existing readiness/rental-write flags.

## Verification

- Studio typecheck, targeted ESLint, build and Prisma validation passed.
- Studio Case 6 detector and internal tool-contract tests passed: 58 tests.
- AI Agent Case 6 simulation, execution and migration tests passed: 15 tests; Ruff and mypy passed.

## Next

Commit and deploy both repositories, run the migrations, then execute the Case 6 production matrix in `docs/agent/case6-unit-schedule-conflict.md` with UUID-scoped fixtures and final cleanup.
