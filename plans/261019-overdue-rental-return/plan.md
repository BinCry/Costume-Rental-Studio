---
title: Case 4 — Rental Return Overdue
status: completed
priority: P1
effort: large
scope: rental-return-overdue
tags: [agent, rentals, operations, detection]
created_at: 2026-10-19T15:30:00+07:00
completed_at: 2026-10-19T17:46:00+07:00
---

# Case 4 — Rental Return Overdue

## Overview

Add a proactive operational case for an `ACTIVE` rental that remains unreturned after `plannedDueAt + lateGraceMinutes`. The case is branch-owned, claimable, analyzable, and read-only. It never extends a rental, charges a fee, contacts a customer, or mutates rental data.

## Requirements

- Rule code: `RENTAL_RETURN_OVERDUE/v1`.
- Candidate: order `ACTIVE`, grace deadline elapsed, at least one item allocation still `ACTIVE` with a unit.
- Finding is order-level: primary entity is the overdue order; affected entity and unit are null.
- Dedupe key: `RENTAL_RETURN_OVERDUE:v1:{orderId}:{plannedDueAt UTC}`.
- Evidence contains only order/unit/status/timestamp/policy facts; no customer PII.
- Resolve when the order is no longer `ACTIVE`, no active unit remains, or a valid extension moves the grace deadline into the future.
- Suppress Case 4 while the same active units produce a Case 1 downstream-readiness risk. If that risk disappears while the rental stays overdue, Case 4 may be created on a later tick.
- Analysis produces non-executable operational guidance only.

## Scope Boundary

Out of scope:

- Sending customer notifications.
- Automatically extending an order.
- Calculating, posting, or collecting late fees.
- Creating CRM disputes or manager approvals.
- UI implementation.
- Cross-branch inventory action.

## Architecture

### AI database and contracts

- Add migration `011_rental_return_overdue.sql`.
- Add case type `RENTAL_RETURN`; retain existing roles and permissions.
- Generalize the operational queue/claim/release path to include `RENTAL_READINESS` and `RENTAL_RETURN`.
- Keep readiness confirmation/execution restricted to `RENTAL_READINESS`.
- Extend finding entity-shape constraint so the overdue rule is order-level.
- Infer case type from finding rule inside the AI repository; clients cannot choose it.

### Studio detector

- Add `rental-overdue.service.ts`; do not further grow `rental-readiness.service.ts`.
- Extract/share the Case 1 risk evaluator needed for downstream suppression.
- Add an opt-in scheduler with defaults:
  - `AGENT_OVERDUE_RETURN_DETECTION_ENABLED=false`
  - `AGENT_OVERDUE_RETURN_INTERVAL_MS=60000`
  - `AGENT_OVERDUE_RETURN_BATCH_SIZE=100`
- Register the scheduler in `worker.ts` and stop it during shutdown.
- Reconcile open findings before scanning new candidates.

### Live context and analysis

- Add read-only Agent Tool `get_overdue_rental_context` with `{ orderId }`.
- Re-read the order, policy, active allocations, and downstream commitments in a read transaction.
- Return PII-free context: grace deadline, overdue minutes, active units, downstream-risk flag, observed timestamp, and order version.
- Add deterministic options:
  - `CONTACT_CUSTOMER_FOR_RETURN`, always non-executable while risk is present.
  - `ESCALATE_OVERDUE_RETURN`, non-executable when overdue exceeds 24 hours.
- LLM may only explain supplied facts/options; deterministic fallback is mandatory.
- Reuse `POST /cases/:caseId/analyze` and `agent_case_analyses`; transition to `PLAN_READY`.
- `POST /confirmations` must reject `RENTAL_RETURN` because its options are not executable.

## Implementation Phases

### Phase 1 — Contract and migration

- [x] Migration 011, case type, finding rule, nullable entity shape.
- [x] Operational queue/claim/release generalized without changing interactive ownership.
- [x] Pydantic/Zod/OpenAPI response compatibility.

### Phase 2 — Detection and reconciliation

- [x] Shared Case 1 evaluator for exact suppression semantics.
- [x] Overdue candidate query, deterministic risk builder, severity, and evidence.
- [x] Open-finding reconciliation and stale-observation handling.
- [x] Feature flag, scheduler, structured logging, worker registration.

### Phase 3 — Analyze

- [x] PII-free `get_overdue_rental_context` Agent Tool.
- [x] Deterministic simulator and narrative fallback.
- [x] Runtime dispatch by rule/case type and optimistic finalize.
- [x] No confirmation or write action for overdue options.

### Phase 4 — Verification and documentation

- [x] Studio unit/contract/route tests.
- [x] AI migration/repository/route/simulation tests.
- [x] Typecheck, lint, build, Ruff, mypy, pytest.
- [x] Lifecycle docs, QA report, and journal.

## Acceptance Criteria

- An overdue active order with active units creates exactly one `RENTAL_RETURN` case/finding.
- An active order still within grace does not create a finding.
- Partial return evidence contains only units still active.
- Return completion or valid due-date extension resolves the finding.
- Case 1 downstream risk suppresses Case 4 for the same active units.
- The next tick can create Case 4 after Case 1 is gone if the source order remains overdue.
- Branch RBAC, claim ownership, version checks, and stale-observation protection work unchanged.
- Analyze returns deterministic non-executable guidance and survives LLM failure.
- Confirmation preparation for Case 4 is rejected before any write tool call.
- Cases 1–3 and interactive cases retain their current behavior.

## Risks

- Generalizing operational case-type checks could accidentally broaden interactive-case access; tests must cover this boundary.
- Suppression must use the same Case 1 evaluator to avoid rule drift.
- A fixed 24-hour escalation threshold is an MVP operational threshold, not a financial policy.

## Success Criteria

- All targeted and shared Agent suites pass with no lint/type/build errors.
- No production database or customer notification channel is touched during tests.
