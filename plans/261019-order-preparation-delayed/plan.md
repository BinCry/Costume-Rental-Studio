---
title: "Proactive order preparation delay case"
status: completed
priority: P1
effort: medium
created: 2026-10-19
---

# Proactive order preparation delay case

## Goal

Add `ORDER_PREPARATION_DELAYED/v1` as the third rental-readiness rule without
overlapping the existing previous-rental and allocated-unit readiness risks.

## Scope

- Detect `CONFIRMED` or `PREPARING` orders starting within two hours whose
  confirmed allocated units are all operationally ready.
- Suppress or resolve the preparation-delay finding whenever Case 1 or Case 2
  applies to any allocated unit.
- Persist one order-level finding (`affected_entity_id` and `unit_id` nullable),
  expose a PII-free live context, and produce deterministic non-executable
  `START_PREPARATION` or `COMPLETE_PREPARATION` guidance.
- Reuse the existing branch queue, claim, analysis, and reconciliation APIs.

## Out of scope

- Automatically moving an order to `PREPARING` or `READY_FOR_PICKUP`.
- Confirmation/write execution, notifications, UI, new roles, or a new case type.

## Acceptance criteria

- A near-pickup order with ready units and delayed workflow creates one finding.
- A previous active rental, unavailable unit, active block, or transfer prevents
  Case 3 and leaves Case 1/2 authoritative.
- An open Case 3 resolves when the order progresses, leaves the warning window,
  becomes terminal, or a Case 1/2 risk supersedes it.
- Analysis uses a fresh PII-free snapshot and cannot produce an executable action.
- Existing Case 1/2 behavior and public API compatibility remain intact.
- Studio typecheck/tests and AI-service tests pass.

## Implementation

1. Generalize finding contracts for order-level findings and add migration 010.
2. Extend the shared readiness detector/context with the mutually exclusive rule.
3. Extend deterministic simulation and fallback explanation for Case 3.
4. Add Studio and AI-service regression tests, then update lifecycle documentation.

## Verification

- [x] Order-level migration and contract are backward compatible with Case 1–2.
- [x] Detector creates Case 3 only when every allocated unit is ready.
- [x] Active previous rentals and unit-readiness risks suppress Case 3.
- [x] Live context is branch-authorized and excludes customer PII.
- [x] Analysis recommendations are deterministic and non-executable.
- [x] Studio typecheck, targeted tests and ESLint pass.
- [x] AI-service Ruff, mypy and all 206 tests pass.
