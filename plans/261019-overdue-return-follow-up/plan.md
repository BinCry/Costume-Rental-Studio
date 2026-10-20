---
title: Case 4 — Overdue Return CRM Follow-up
status: completed
priority: P1
effort: large
scope: overdue-return-follow-up
tags: [agent, rentals, crm, follow-up]
created_at: 2026-10-19T23:20:00+07:00
completed_at: 2026-10-20T00:15:00+07:00
---

# Case 4 — Overdue Return CRM Follow-up

## Goal

Let the employee who owns an open `RENTAL_RETURN` agent case record the real outcome of an overdue-return contact in Studio CRM without exposing customer PII to the AI service or mutating the rental lifecycle.

## Decisions

- `CustomerInteraction` is the source of truth for completed contact attempts.
- The explicit follow-up command is a human-confirmed write; the LLM cannot originate it.
- The AI service validates case type, ownership, branch scope, open finding and optimistic case version before invoking the Studio tool.
- Studio derives customer and branch from the order; callers cannot choose another customer.
- A persisted idempotency key makes retries safe.
- `PROMISED_RETURN` stores the promised time but leaves the order `ACTIVE` and Case 4 open.
- This slice does not auto-create a CRM case; the Agent Case remains the operational queue until an explicit escalation policy exists.
- Extension and physical return remain separate rental workflows and are the only operations that can remove the overdue condition.

## Scope

### In scope

- Structured CRM interaction outcome, promised-return time, next-follow-up time, source reference and idempotency.
- Studio Agent Tool `record_overdue_follow_up` with CRM branch authorization.
- Authenticated Case 4 follow-up endpoint through Studio and AI service.
- Confirmation-gated follow-up execution with readback recovery.
- Contract, repository, route and regression tests across both services.
- Lifecycle documentation and QA report.

### Out of scope

- Frontend UI.
- Sending phone, email, chat or social messages.
- Automatic extension, return completion, fee calculation or payment collection.
- Automatic resolution of Case 4 from a promise or CRM status.

## Acceptance criteria

- Only the current owner of a claimed `RENTAL_RETURN` case with an open finding can submit a follow-up.
- The order ID always comes from the finding; Studio derives customer and branch and validates the order is still the matching active rental.
- One accepted command creates one `FOLLOW_UP` interaction linked to the order, customer, branch and acting employee.
- Retrying the same idempotency key returns the same interaction without duplication.
- `PROMISED_RETURN` requires a future `promisedReturnAt`; `nextFollowUpAt` cannot precede the interaction.
- The write does not change rental order status, due date, allocation or unit status and does not resolve the agent finding.
- AI receives no customer name, email or phone; write arguments contain only order/case references and operational follow-up data.
- Cases 1–5, generic CRM operations and existing agent execution remain backward compatible.

## Implementation phases

### Phase 1 — CRM persistence

- [x] Add Prisma migration/model fields and outcome enum.
- [x] Add idempotent overdue-follow-up CRM service operation.
- [x] Extend validation and tests without breaking generic interaction creation.

### Phase 2 — Studio agent contract

- [x] Add fixed allowlisted write tool and feature flag.
- [x] Add tool schema/service dispatch and safe response.
- [x] Add public Agent Case follow-up proxy contract and tests.

### Phase 3 — AI case workflow

- [x] Add request model and Case 4 confirmation-preparation route.
- [x] Validate ownership/version/open finding, freeze the fixed Studio tool, and confirm through the existing decision route.
- [x] Preserve the open finding, transition the case to monitoring after write/readback, and append auditable execution evidence.

### Phase 4 — Verification and documentation

- [x] Run Studio and AI targeted/full regression suites plus static/build/schema checks.
- [x] Review security, PII, idempotency, concurrency and Cases 1–5 compatibility.
- [x] Update lifecycle documentation, completion report and journal.

See [completion-report.md](completion-report.md) for verification results and the PostgreSQL test-environment limitation.
