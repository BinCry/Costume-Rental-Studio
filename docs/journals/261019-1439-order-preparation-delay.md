---
title: "Order preparation delay Agent case"
date: 2026-10-19
tags: [agent, rentals, readiness, detection]
---

# Order preparation delay Agent case

## Context

The readiness worker already detected a previous customer retaining a unit and an allocated unit
that could not become ready. A third case was needed for orders whose inventory is ready while the
staff preparation workflow itself is late.

## What happened

- Added `ORDER_PREPARATION_DELAYED/v1` as an order-level finding.
- Made `affected_entity_id` and `unit_id` nullable only for the new rule.
- Reused the existing branch queue, claim, analysis, optimistic concurrency, and reconciliation.
- Added deterministic `START_PREPARATION` and `COMPLETE_PREPARATION` guidance without write tools.

## Decisions

- Case 1/2 have precedence. Any active prior allocation or unit readiness issue suppresses Case 3.
- Case 3 remains `RENTAL_READINESS`; a new case type and new role were unnecessary.
- The Agent cannot mark an order ready until the domain has a preparation checklist that proves the
  physical handoff work is complete.

## Verification

- Studio typecheck, targeted ESLint and 80 related tests passed.
- AI service Ruff, mypy and all 206 tests passed.
- The monolithic Studio test command hit the local Node memory limit; the affected suites passed
  independently.

## Next

- Deploy AI migration 010 before enabling readiness detection.
- Add UI presentation for non-executable preparation recommendations when the queue UI is built.
