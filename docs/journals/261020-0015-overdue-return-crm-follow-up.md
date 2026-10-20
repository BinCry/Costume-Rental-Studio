---
date: 2026-10-20
session: overdue-return-crm-follow-up
---

# Journal: overdue-return CRM follow-up

## Context

Case 4 already detected overdue rentals and provided non-executable guidance. The missing piece was a durable record of what an employee actually did after contacting the customer.

## Decision

`CustomerInteraction` is the source of truth for completed contact attempts, while the Agent Case remains the operational queue. A contact record is not evidence that the costume was returned and is not permission to extend the rental or replace an allocated unit.

The command accepts only structured operational fields. Studio derives the customer and branch from the order and generates a deterministic summary. This keeps customer names, phone numbers, email addresses, and conversation text out of the AI service.

## Result

The employee prepares and confirms one frozen CRM write. Studio performs the final permission and live-order checks, persists the interaction idempotently, and supports readback after uncertain network outcomes. A verified record moves the case to `MONITORING` but leaves the overdue finding open until the rental is returned or validly extended.

## Follow-up

The next product slice can add a UI for this endpoint and a separately governed escalation policy. Automatic messaging, fee collection, rental extension, and CRM-case creation remain out of scope.

