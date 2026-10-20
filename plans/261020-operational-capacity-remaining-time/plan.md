---
title: Case 5 — Remaining Operational Capacity
status: completed
priority: P1
effort: large
scope: operational-capacity-remaining-time
tags: [agent, operations, scheduling, capacity]
created_at: 2026-10-20T00:00:00+07:00
completed_at: 2026-10-20T08:25:00+07:00
---

# Case 5 — Remaining Operational Capacity

## Goal

Replace the static whole-window Case 5 comparison with a remaining-work versus
remaining-capacity comparison while preserving the existing public
`availableMinutes` field as the full-window labor-minute budget.

## Decisions

- `availableMinutes` remains backward compatible and means labor minutes available
  for the complete capacity window.
- Active-window capacity is prorated by the unelapsed share of the window; future
  windows retain their full capacity.
- A `UnitBlock` is explicitly assigned to at most one capacity window through
  `capacityWindowId`.
- `PLANNED` workload uses `estimatedEffortMinutes`.
- `IN_PROGRESS` workload uses `remainingEffortMinutes`; it is incomplete data when
  that value is absent.
- `COMPLETED` and `CANCELLED` blocks contribute no remaining workload.
- `blockedFrom` and `blockedUntil` continue to describe unit unavailability and are
  not treated as labor effort.
- Case 5 remains read-only and does not assign staff, edit tasks, or alter rentals.

## Scope

### In scope

- Add nullable `capacityWindowId` and `remainingEffortMinutes` to `UnitBlock`.
- Validate branch/window ownership and workload fields in scheduling writes.
- Calculate `remainingAvailableMinutes`, `remainingRequiredMinutes`, and the gap at
  the detector observation time.
- Update Agent Tool context, deterministic AI analysis, evidence, documentation,
  and regression tests.
- Preserve existing capacity-window API fields and Case 1–4 behavior.

### Out of scope

- Employee shifts, attendance, leave, breaks, skill matrices, or productivity.
- Automatic inference of capacity from branch opening hours or employee count.
- Time tracking or automatic deduction based on `startedAt` wall-clock elapsed time.
- Automatic task reassignment, staffing changes, transfers, or rental mutations.
- Frontend implementation.

## Implementation phases

### Phase 1 — Data and scheduling contracts

- [x] Add Prisma fields, relations, constraints/indexes, and a forward migration.
- [x] Extend unit-block create/update contracts without breaking existing callers.
- [x] Enforce that a selected capacity window belongs to the unit's current branch.
- [x] Keep existing `availableMinutes` request and response fields stable.

### Phase 2 — Remaining-capacity detector

- [x] Query blocks by explicit `capacityWindowId` rather than `blockedUntil`.
- [x] Compute time-prorated remaining capacity for active windows.
- [x] Use estimated effort for `PLANNED` and remaining effort for `IN_PROGRESS`.
- [x] Treat absent required effort as incomplete data and avoid false findings.
- [x] Reconcile existing findings and preserve stale-observation protection.

### Phase 3 — Agent analysis and documentation

- [x] Expose remaining values in the PII-free live context and evidence.
- [x] Update deterministic simulation and Vietnamese fallback narrative.
- [x] Update lifecycle documentation with the revised Case 5 semantics.

### Phase 4 — Verification

- [x] Add migration/schema/API and detector tests for future, active, and expired windows.
- [x] Cover planned, in-progress, completed, cancelled, and incomplete-data workloads.
- [x] Run targeted Studio and AI tests.
- [x] Run Prisma validation, typecheck, lint, and build checks.
- [x] Review contract compatibility and Case 1–4 regression risk.

## Acceptance criteria

- A future window compares full labor capacity with remaining assigned workload.
- An active window compares prorated remaining capacity at `observedAt` with remaining
  assigned workload.
- A `PLANNED` block contributes its estimate; an `IN_PROGRESS` block contributes its
  explicit remaining effort; terminal blocks contribute zero.
- Missing required effort produces no false capacity-shortfall finding.
- Blocks not assigned to the window do not contribute to that window's workload.
- Moving, completing, cancelling, or reducing remaining work resolves an open finding
  on a later tick when the gap disappears.
- Context and evidence report full and remaining capacity/workload values without PII.
- Existing `availableMinutes` clients remain valid.
- Case 5 options remain non-executable and Cases 1–4 retain their existing behavior.

## Compatibility notes

- Existing unit blocks remain valid with both new fields null but do not participate
  in a Case 5 window until explicitly assigned.
- No existing migration is edited; a new forward migration evolves the schema.
- `availableMinutes` is retained to avoid a breaking public API rename.
