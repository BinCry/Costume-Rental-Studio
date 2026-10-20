# Phase 4 — Rental Readiness Execution

Phase 4 turns the one deterministic same-branch recommendation from Phase 3
into a guarded operational write.

1. A claimed staff member prepares confirmation using only the active analysis
   ID and case version.
2. The service re-reads live rental readiness data. It never accepts a target
   unit or tool arguments from the client.
3. If the finding remains valid, it freezes a `reallocate_rental_item` action
   with a payload hash and moves the case to `WAITING_CONFIRMATION`.
4. Confirm sends `confirmationId`, `payloadHash`, `readbackTool`, and the frozen
   `actionSnapshot` to Studio. Studio recomputes the canonical snapshot hash and
   requires the frozen tool, arguments, expected order version, and
   `get_rental_order` read-back contract to match the execution request. The
   request must use the deterministic key
   `agent:{caseId}:reallocate_rental_item:{payloadHash}`.
5. Studio rechecks the active branch, actor RBAC, resource branch, and
   `AGENT_RENTAL_WRITE_ENABLED` before the domain mutation. Confirm executes
   once with the current Rental Order version, then verifies the allocated unit
   through `get_rental_order` read-back.
6. Verified success resolves the finding with `RECOMMENDATION_EXECUTED` and
   completes the case. A reject returns the case to `PLAN_READY` while keeping
   the finding open.

`AGENT_READINESS_EXECUTION_ENABLED` is disabled by default and additionally
requires `AGENT_RENTAL_WRITE_ENABLED`. Timeout or uncertain outcomes are never
blindly retried; the case moves to `MONITORING` for later reconciliation.

This release is limited to `reallocate_rental_item`; other Studio write tools
remain fail-closed unless separately released. Studio does not yet persist a
durable authorization/idempotency ledger that independently binds a
confirmation to its case, actor, frozen payload, and final execution result.
