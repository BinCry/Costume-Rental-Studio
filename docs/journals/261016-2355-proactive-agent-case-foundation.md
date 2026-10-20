---
date: 2026-10-16
session: proactive-agent-case-phase-1
---

# Journal: 2026-10-16 — Proactive Agent Case Foundation

## Context

Phase 1 establishes the backend contract for operational rental-readiness cases before adding scheduling, AI analysis, simulation, notifications, or UI. The core problem is to preserve private interactive cases while allowing a system-created case to enter a branch queue, be claimed by one staff member, and react safely when live rental data changes.

## What Happened

- Extended the AI database model with nullable ownership, explicit creator/origin/type, branch scope, claim timestamp, deadline, and a branch queue index. Existing cases are backfilled as user-created interactive cases.
- Added `agent_findings` as the durable risk record. Its partial unique index on open `dedupe_key` and transactional upsert ensure concurrent detections converge on one finding and one root case.
- Added operational list, claim, release, and internal finding-upsert contracts. Claim/release use expected case versions; a repeated claim by the same actor is idempotent, while stale or competing claims return explicit conflicts.
- Propagated branch read/manage scopes from Studio API through internal headers that are accepted only behind the internal service key. Interactive access remains owner-only; operational mutations require both branch management permission and current ownership.
- Allowed monitored or waiting cases to return to `ANALYZING`. Reanalysis increments the case version and expires pending confirmations/approvals, while terminal cases stay closed and executing writes are not retried.
- Expanded TypeScript/Pydantic/OpenAPI contracts with optional operational metadata to preserve existing clients. Added focused migration, repository, auth, route, service, and state-transition tests.

## Reflection

The useful boundary is between deterministic coordination and AI reasoning. Branch scope, deduplication, ownership, version conflicts, and action gates belong in database and application contracts; the future scheduler and model should only supply detections and proposals through those guarded paths. The partial unique index is especially important: application-level pre-checks alone cannot prevent two workers from opening duplicate cases.

Reanalysis is deliberately a versioned invalidation event. Expiring stale decisions protects against approving an option derived from old inventory state, but the implementation must continue to avoid interrupting an already executing write. Keeping operational fields optional also limits regression risk for the existing interactive flow.

## Decisions

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Keep interactive ownership and add branch-scoped operational cases | The two workflows have different visibility and assignment semantics | Existing chat remains private; staff share a branch queue |
| Require claim before operational mutations | Creates one accountable operator and prevents conflicting actions | Chat, confirm, reject, and cancel are gated by owner plus branch manage scope |
| Use optimistic case versions for claim/release | Snapshots can become stale between queue read and action | Races fail explicitly instead of silently overwriting ownership |
| Deduplicate open findings in PostgreSQL | Concurrency safety must not depend on process timing | Parallel detectors resolve to one open finding and one case |
| Return waiting/monitoring cases to `ANALYZING` on live changes | Existing proposals may no longer be valid | Pending decisions expire and must be regenerated from current evidence |
| Keep business UUIDs as references only | AI and Studio databases have separate ownership boundaries | No cross-database foreign keys or coupled migrations |

## Next

- In Phase 2, add the scheduler/detector that calls the internal finding-upsert endpoint; keep AI analysis and human confirmation downstream of this deterministic foundation.
- Add notification and operator UI only after the detector contract and retry policy are stable.
