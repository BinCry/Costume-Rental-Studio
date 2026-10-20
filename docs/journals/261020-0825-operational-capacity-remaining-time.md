---
date: 2026-10-20
session: operational-capacity-remaining-time
---

# Journal: 2026-10-20 — Remaining Operational Capacity

## Context

Case 5 previously compared all estimated work with a static full-window capacity. That overstated available capacity after a window started and counted in-progress work as if no progress had been made.

## What Happened

- Added nullable `capacityWindowId` and `remainingEffortMinutes` fields to `UnitBlock`, with a forward migration, relation/index, non-negative remaining-effort constraint, and branch ownership validation.
- Assigned workload explicitly to a capacity window instead of inferring it from `blockedUntil`.
- Kept `availableMinutes` backward compatible as the full-window labor budget; active windows now prorate it by the unelapsed window fraction, future windows keep the full amount, and expired windows produce no risk.
- Calculated remaining work from `estimatedEffortMinutes` for `PLANNED` blocks and `remainingEffortMinutes` for `IN_PROGRESS` blocks; terminal blocks do not participate.
- Exposed full and remaining capacity/workload values in PII-free finding evidence and live Agent context while keeping Case 5 recommendations non-executable.
- Updated scheduling contracts, deterministic analysis, documentation, migration coverage, and detector regression tests.

## Review-Discovered Issues and Fixes

- Aggregate totals and bounded detail rows could disagree during concurrent updates. Window and workload reads now run in one repeatable-read snapshot, and completeness uses authoritative aggregate counts.
- Large windows could emit unbounded evidence. Workload and missing-effort details are capped at 100 rows with truncation metadata while aggregate totals remain exact.
- An in-progress block can have remaining effort but no original estimate. `requiredMinutes` now falls back per task to its remaining effort while `remainingRequiredMinutes` continues to use the explicit remaining value.
- Cross-branch capacity assignment could corrupt a branch-level calculation. Scheduling writes now reject a window that does not belong to the unit's current branch.
- Remaining effort could be written in an invalid lifecycle state. Planned blocks cannot preload it; starting a block initializes it from the estimate; an in-progress block only permits remaining-effort updates.

## Decisions

| Decision | Rationale | Impact |
| --- | --- | --- |
| Preserve `availableMinutes` | Avoid a breaking API rename | Existing clients remain valid; semantics are documented as full-window labor minutes |
| Prorate capacity linearly | The project has no shift/attendance model | Case 5 reflects elapsed time without inventing staffing data |
| Require explicit window assignment | Asset deadlines are not work scheduling | Only intentionally scheduled work affects a window |
| Suppress findings when required effort is missing | Partial totals understate demand | Incomplete data cannot create a false shortfall |
| Keep block duration separate from labor effort | Unit unavailability is not employee work time | `blockedFrom`/`blockedUntil` remain availability boundaries only |

## Verification

- Final focused Vitest run: 4 files, 49 tests passed; the broader safe API run passed 80 tests across 6 files.
- API full-suite review run passed 376 tests with 17 skipped; AI safe suite passed 22 tests.
- `prisma validate`, TypeScript typecheck, ESLint, API production build, Ruff, and mypy passed.

## Limitations

- Capacity is still manually declared and linearly prorated; opening hours, staffing, breaks, skills, productivity, and parallel work are not modeled.
- Existing blocks with no `capacityWindowId` remain valid but are excluded from Case 5 until assigned.
- Missing planned estimates or in-progress remaining effort suppresses the finding rather than estimating unknown work.
- No frontend or automatic task/staff reassignment was added.

## Next Steps

- Deploy the operational-capacity migrations in order and backfill window assignments where appropriate.
- Add operator UI for capacity windows, assignments, estimates, and remaining-effort updates.
- Introduce a separately designed workforce model before deriving capacity from staff schedules.
