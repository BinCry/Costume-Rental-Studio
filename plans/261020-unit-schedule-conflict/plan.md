---
title: 'Case 6 — Unit schedule conflict'
status: implemented
priority: P1
effort: large
created: 2026-10-20
---

# Case 6 — Unit schedule conflict

## Goal

Detect inconsistent overlapping reservations for the same physical costume unit, create one branch-scoped proactive case for each canonical order pair/unit/window, and allow a confirmed reallocation to a currently available replacement unit with mandatory read-back verification.

## Decisions

- Rule code: `UNIT_SCHEDULE_CONFLICT/v1`.
- Case type: reuse `RENTAL_READINESS`; no new role or workforce model.
- Conflict intervals use persisted `RentalOrderItem.occupiedFrom` and `occupiedUntil`; the latter already includes late-return and cleaning protection buffers.
- Eligible allocations are `CONFIRMED` or `ACTIVE` on non-terminal operational orders.
- Pair ordering is canonical so scanner order cannot create duplicate findings.
- The order that starts later is the primary order to reallocate; the earlier order is affected context.
- Analysis is PII-free and may propose only an available same-variant replacement unit for the primary order.
- Execution reuses the existing guarded `reallocate_rental_item` write tool, confirmation snapshot, expected version, idempotency key and read-back flow.

## Expected output

- Studio API detector, reconciliation, internal finding contract and PII-free live-context support for `UNIT_SCHEDULE_CONFLICT`.
- AI Agent rule routing, deterministic simulation/recommendation, confirmation/execution and verification support.
- Feature-flagged worker registration, migrations only where persisted AI constraints require them, automated tests, lifecycle documentation and production E2E guidance.

## Acceptance criteria

- Two eligible order items allocated to the same unit with overlapping protected intervals create exactly one Case 6 finding.
- Adjacent non-overlapping intervals, terminal orders, unassigned/released items and different units do not create findings.
- Repeated scans update the same finding; stale observations cannot overwrite newer evidence.
- Reallocation, cancellation, release or schedule correction that removes the overlap resolves the finding and succeeds the non-executing case.
- Live context is branch-authorized, PII-free and re-evaluates the conflict from current Studio data.
- Analyze returns a deterministic recommendation with a currently available same-variant replacement, or a non-executable handoff when none exists.
- Confirmation binds the exact order item, replacement unit, order version and analysis snapshot.
- Execute is rejected without ownership, permission, valid confirmation, matching snapshot or enabled write flags.
- Successful execution reallocates once, performs read-back and verifies that the original conflict no longer exists.
- Case 1–5 behavior and existing public API contracts remain compatible.

## Scope

### In scope

- Deterministic detection and reconciliation.
- Existing branch queue, claim and authorization behavior.
- AI live context, analysis, confirmation, guarded reallocation and read-back.
- Configuration, migrations where necessary, tests and documentation.

### Out of scope

- Automatically changing rental dates, cancelling orders or changing price/payment data.
- Cross-variant substitution or customer-consent workflow for a different costume/size.
- New frontend screens, notifications, staffing or shift scheduling.
- Weakening the synchronous availability guards already protecting confirm/reallocate/extend operations.

## Implementation phases

### Phase 1 — Contracts and detector

- [x] Extend Studio internal finding schemas and rule typing.
- [x] Add canonical overlap builder, database candidate query and reconciliation under the existing readiness feature flag.
- [x] Register the rule in the existing API/worker readiness lifecycle.
- [x] Add PII-free live context using the same conflict evaluator.

### Phase 2 — Agent analysis and persistence

- [x] Extend AI persisted rule constraints through forward migration `013_unit_schedule_conflict.sql`.
- [x] Route Case 6 through rental-readiness analysis.
- [x] Produce deterministic replacement/handoff recommendations and safe fallback narrative.

### Phase 3 — Confirmation and execution

- [x] Bind the proposed reallocation to the current order/item/unit/version snapshot.
- [x] Reuse existing confirmation/approval guards and reallocation tool.
- [x] Verify through the existing reallocation read-back flow.

### Phase 4 — Verification and release documentation

- [x] Add Studio unit/integration regression tests.
- [x] Add AI analysis, execution, migration and repository regression tests.
- [x] Run Prisma validation, TypeScript typecheck/lint/build and affected test suites; run Python Ruff/mypy and affected test suites.
- [x] Update lifecycle docs and production E2E runbook.
