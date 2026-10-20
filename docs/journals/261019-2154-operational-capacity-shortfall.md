---
date: 2026-10-19
session: operational-capacity-shortfall
---

# Journal: 2026-10-19 — Operational Capacity Shortfall

## Context

Cases 1–4 detect rental/unit-specific exceptions. Case 5 adds a branch-level signal for aggregate operational workload without pretending the current employee records represent actual shift capacity.

## What Happened

- Added time-bounded branch capacity windows managed through the scheduling API.
- Added explicit unit-block effort estimates and deterministic shortfall calculation.
- Added branch-level finding creation, deduplication, reconciliation and worker configuration.
- Added a PII-free live tool plus deterministic non-executable analysis.
- Added AI case type/migration support and kept confirmation/write execution unavailable.
- Verified the complete Studio and AI regression suites.
- Final review constrained deadlines to the capacity window, wired the detector into both API-worker modes, bounded workload details, and made confirmation rejection explicit.

## Reflection

The key design choice was to model capacity as declared operational data. Counting employees would have produced confident but unsupported warnings because the system has no attendance, shift or skill model. Refusing to create a finding when effort is incomplete keeps the rule auditable.

## Decisions

| Decision | Rationale | Impact |
| --- | --- | --- |
| Capacity windows are explicit | Employee records do not prove availability | No guessed staffing capacity |
| Unit-block effort is separate from block duration | Asset unavailability is not equal to labor effort | Workload remains semantically correct |
| Missing effort suppresses the finding | Partial totals understate workload | Fewer false positives |
| All recommendations are non-executable | Staffing and priority changes need human judgment | No automatic assignments or mutations |
| Aggregate totals and completeness in the database | Large windows must not materialize every task or race on completeness | Exact totals with at most 100 detail rows |

## Next

- Apply both database migrations in deployment order.
- Add a UI for capacity windows and effort estimates if operators will maintain them directly.
- Model shifts and skills separately before calling this a staff-shortage predictor.
