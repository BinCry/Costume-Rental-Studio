---
date: 2026-10-20
session: agent-write-tool-release
---

# Journal: Agent write-tool release

## Context

Production Case 1 and Case 2 reached confirmation, but Studio rejected every
mutation with `AGENT_WRITE_TOOLS_NOT_READY`. The blanket write gate needed a
narrow release path without exposing the rest of the Agent write surface.

## What Happened

- Released only `reallocate_rental_item` and `record_overdue_follow_up`.
- Required `confirmationId`, `payloadHash`, `readbackTool`, and the frozen
  `actionSnapshot` for both tools.
- Studio recomputes the canonical SHA-256 hash and verifies the frozen tool
  name, arguments, expected version, and read-back contract before mutation.
- Studio requires the deterministic `agent:{caseId}:{toolName}:{payloadHash}`
  idempotency key, preventing a valid snapshot from being replayed under a
  different case or key.
- Studio still enforces active branch state, actor RBAC, resource branch, and
  each tool's feature flag.
- Kept every other write tool fail-closed with
  `AGENT_WRITE_TOOLS_NOT_READY`.

## Decisions Made

| Decision                                                   | Rationale                                                      | Impact                                                                                               |
| ---------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Release an explicit two-tool allowlist                     | Limit production mutation scope                                | Unreleased write tools remain fail-closed                                                            |
| Bind each request to a frozen snapshot and fixed read-back | Reject payload, version, or verification drift before mutation | Reallocation reads back with `get_rental_order`; follow-up reads back by interaction idempotency key |
| Preserve domain authorization checks                       | Confirmation evidence does not replace Studio authorization    | Branch, RBAC, resource scope, and feature flags are rechecked at execution                           |

## Residual Limitation

Studio does not yet persist a durable authorization/idempotency ledger that
independently binds a confirmation to its case, actor, tool, payload hash, and
execution result. Frozen snapshot verification protects request integrity, but
durable replay authorization and general reconciliation remain follow-up work.

## Next Steps

- Deploy Studio API and the matching AI Agent contract.
- Rerun production Case 1–5 and verify Case 1/2 mutation plus read-back.
- Keep additional write tools blocked until they receive equivalent
  authorization, idempotency, reconciliation, and release review.
