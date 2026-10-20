---
date: 2026-10-17
session: rental-readiness-detection-phase-2
---

# Journal: 2026-10-17 — Rental Readiness Detection

## Context

Phase 2 adds deterministic detection for a unit still on an active rental when its next confirmed rental is approaching. The detector deliberately creates or reconciles operational Agent Cases only; AI analysis, recommendations, notifications, and UI remain Phase 3 work.

## What Happened

- Added a Studio worker that scans eligible upcoming orders every configured interval, finds active allocations for the same unit, applies variant or policy cleaning buffer, and upserts `PREVIOUS_RENTAL_NOT_RETURNED/v1` findings.
- Added bounded reconciliation of open findings. It resolves risks when the prior unit is returned or the next order no longer has the same actionable allocation, then lets the AI service close the non-executing case as `SUCCEEDED`.
- Extended AI service internal contracts with paginated open-finding reads, idempotent resolve, `observedAt`, and `source_observed_at`. Studio validates all AI responses and sends only the service key.
- Added migration/index support for observation ordering and efficient readiness candidate scans, plus feature-flagged worker startup and structured tick metrics.

## Reflection

The detector remains a read-only consumer of rental data: it never changes an order, allocation, or unit. Its only external side effect is a guarded finding upsert/resolve call, which keeps business automation and AI coordination separate.

Stale observation ordering is necessary because replicas and retries can finish out of order. Resolution also refuses to alter a case in `EXECUTING`; that avoids invalidating a write already in progress and leaves the finding for a later reconciliation tick. Keyset pagination over `(plannedStartAt, id)` and finding cursors bound each run without skipping equal pickup timestamps.

## Decisions

| Decision | Rationale | Impact |
|---|---|---|
| Use deterministic polling for one readiness rule | Validate operational detection before model reasoning | Scheduler creates/updates cases without calling an LLM |
| Compare `observedAt` before mutation | Older scans must not overwrite newer live observations | Upsert/resolve can safely retry across replicas |
| Guard active execution during resolve | An in-flight write must not be cancelled by reconciliation | AI service returns a conflict; the next tick retries |
| Use keyset pagination | Fixed-size scans must remain stable as rows change | No offset drift; equal pickup timestamps are covered |
| Keep detection disabled by default | Contract and migrations must exist before a worker emits findings | Controlled rollout through environment configuration |

## Operations and Verification

- Deploy AI migration `007_finding_observation_ordering.sql` after the Phase 1 schema, then deploy the AI service routes and Studio migration for `(status, planned_start_at, id)` before enabling `AGENT_READINESS_DETECTION_ENABLED`.
- Configure the same internal service key in both services. Defaults are disabled detection, 60-second interval, 24-hour lookahead, and batches of 100; enable only after internal list/upsert/resolve health checks pass.
- Verification passed: Studio full suite `321 passed, 17 skipped`; focused readiness `14/14`; Studio typecheck, lint, and Prisma validation passed. AI full pytest previously passed with `178`; after fixes, focused routes/migration/repository tests collected `35`, route re-review `15` passed, state re-review `10/10`, and Ruff/Mypy for `app` passed.

## Next

- Phase 3 will use an open, claimed readiness case as the guarded entry point for AI analysis, scenario simulation, recommendation, and explicit human confirmation.
