---
title: Case 5 — Operational Capacity Shortfall
status: completed
priority: P1
effort: large
scope: operational-capacity-shortfall
tags: [agent, operations, scheduling, capacity]
created_at: 2026-10-19T18:00:00+07:00
completed_at: 2026-10-19T21:54:00+07:00
---

# Case 5 — Operational Capacity Shortfall

## Goal

Detect a branch-level operational capacity shortfall when the explicitly estimated effort of active unit work due in a configured capacity window exceeds that window's explicitly configured available minutes.

## Decisions

- Rule code: `OPERATIONAL_CAPACITY_SHORTFALL/v1`.
- Case type: `OPERATIONAL_CAPACITY`; no new role.
- Capacity is explicit, time-bounded data. It is never inferred from employee count or role assignments.
- Workload comes from `PLANNED` and `IN_PROGRESS` unit blocks with an explicit `estimatedEffortMinutes` value and a deadline inside the capacity window.
- A window with any relevant block missing effort is insufficient data and does not create a shortfall finding.
- Finding is branch-level: `primaryEntityId = branchId`; affected entity and unit are null.
- Analysis is read-only and produces only non-executable operational guidance.

## Scope

### In scope

- Prisma model and scheduling API for branch capacity windows.
- Optional effort estimate on unit blocks, required for Case 5 evaluation.
- Deterministic detector, reconciliation, deduplication, feature flag and worker registration.
- PII-free live-context Agent Tool.
- AI migration, case routing, deterministic analysis and fallback narrative.
- Studio and AI tests, regression checks and documentation.

### Out of scope

- Frontend UI.
- Attendance, clock-in/out, shift rosters or skill matrices.
- Automatic task assignment, staffing changes, transfers or rental changes.
- Customer notification.
- Inference of labor capacity from employee records.

## Acceptance criteria

- A configured active window creates one Case 5 finding when complete workload effort exceeds available minutes.
- A window at or below capacity creates no finding.
- A window or relevant task with incomplete capacity/effort data creates no false shortfall.
- Completed/cancelled work is excluded.
- Updating workload or capacity so the gap disappears resolves the open finding.
- Repeated ticks update the same finding and stale observations cannot overwrite newer state.
- Live context is branch-authorized and excludes employee/customer PII.
- Analyze returns deterministic non-executable reprioritize/escalate guidance and survives LLM failure.
- Confirmation preparation is rejected before any write tool call.
- Cases 1–4 and interactive cases retain existing behavior.

## Implementation phases

### Phase 1 — Studio capacity data

- [x] Add Prisma schema/migration for capacity windows and unit-block effort.
- [x] Add validated scheduling endpoints for capacity-window CRUD.
- [x] Preserve existing unit-block API compatibility.

### Phase 2 — Detection

- [x] Add branch-capacity detector and reconciliation service.
- [x] Add PII-free live context tool.
- [x] Add opt-in scheduler and worker lifecycle wiring.

### Phase 3 — AI case and analysis

- [x] Add migration 012 and `OPERATIONAL_CAPACITY` contract support.
- [x] Add runtime dispatch and deterministic simulator/narrative fallback.
- [x] Keep all Case 5 options non-executable.

### Phase 4 — Verification

- [x] Add Studio and AI regression tests.
- [x] Run typecheck, lint, build, Prisma validation, Ruff, mypy and pytest.
- [x] Update lifecycle documentation, QA report and journal.

