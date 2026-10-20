# Case 4 overdue-return follow-up

## Purpose

Case 4 detects an active rental that remains unreturned after its grace deadline. The agent may recommend contacting the customer, but it does not send a message, extend the rental, complete a return, calculate a fee, or reallocate a unit.

After an employee actually contacts the customer, the employee can record the outcome through a confirmation-gated command. `CustomerInteraction` is the source of truth for that completed contact attempt; the Agent Case remains the operational queue.

## Flow

1. The deterministic overdue worker creates or refreshes an open `RENTAL_RETURN_OVERDUE/v1` finding.
2. An employee claims the related `RENTAL_RETURN` case and runs analysis.
3. The employee submits structured follow-up data to `POST /api/v1/agent/cases/:caseId/overdue-follow-ups/confirmations`.
4. The AI service verifies the owner, branch, case version, active analysis, open finding, and live overdue context.
5. The service freezes exactly one `record_overdue_follow_up` action. Customer identity and free-text notes are not accepted.
6. The employee confirms through the existing confirmation endpoint.
7. Studio rechecks CRM permission and that the rental is still `ACTIVE`, derives the customer and branch from the order, and creates one idempotent `FOLLOW_UP` interaction.
8. The AI service reads the interaction back by idempotency key. A verified write moves the Agent Case to `MONITORING`; it does not resolve the finding.

## Structured outcomes

- `CONTACTED`
- `PROMISED_RETURN` — requires a promised return time that is in the future when confirmation is prepared.
- `NO_ANSWER` — requires a next follow-up time.
- `REFUSED_RETURN` — requires a next follow-up time.
- `REQUESTED_EXTENSION` — requires a next follow-up time; it does not extend the rental.
- `OTHER`

The contact time cannot be in the future. A promised return or next follow-up time must be after the contact time. Studio generates the interaction summary from the outcome so customer PII or conversation text does not pass through the AI service.

## Data and lifecycle boundaries

The CRM interaction stores the order, derived customer, derived branch, employee, channel, outcome, contact time, optional promised-return time, optional next-follow-up time, source reference, and idempotency key.

Recording a follow-up never changes:

- rental status or due date;
- allocation or costume-unit status;
- fees, payments, or refunds;
- the open overdue finding.

A physical return or an approved extension remains a separate rental workflow. Those workflows change the live overdue condition, after which the detector resolves the finding normally.

## Deployment

Apply migration `20261019220000_overdue_follow_up_interactions` before enabling the write path. Keep `AGENT_CRM_WRITE_ENABLED=false` in both services until the migration and both application versions are deployed.

