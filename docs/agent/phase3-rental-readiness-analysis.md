# Phase 3 — Rental readiness analysis

Phase 3 starts only after an authorized staff member claims an open
`RENTAL_READINESS` case and posts to `POST /api/v1/agent/cases/:caseId/analyze`.

The Studio read tool returns a PII-free snapshot of orders A/B, the current
unit, cleaning buffer, and eligible same-variant replacement units at B's pickup
branch. The AI service evaluates only this snapshot:

- `KEEP_CURRENT_UNIT` is the infeasible baseline when the finding remains open.
- `REALLOCATE_SAME_BRANCH` options are sorted by `unitCode`, then `unitId`.
- The first feasible option is a recommendation preview only; it cannot execute.

An active analysis is immutable. A newer finding observation marks it `STALE`
and sends a `PLAN_READY` case back to `ANALYZING`. The model may summarize the
deterministic result, but it cannot add options or alter ranks/action arguments.
If the model is unavailable, a deterministic Vietnamese explanation is stored.

Phase 3 does not create confirmations, call write tools, send notifications, or
perform cross-branch transfers. Phase 4 must take the preview, read the live
state again, and freeze a new confirmation snapshot before execution.
