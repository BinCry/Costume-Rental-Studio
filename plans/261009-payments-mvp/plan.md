---
title: "Payment and refund MVP"
status: completed
priority: P1
effort: large
branch: main
tags: [payments, rentals, payos]
created: 2026-10-09
---

# Payment and refund MVP

## Scope

Implement rental payments/refunds with staff cash collection, customer/staff payOS checkout,
signed provider webhooks, settlement, refund lifecycle, RBAC, and API tests.

## Acceptance criteria

- Staff with branch-scoped payment permissions can read a rental order settlement and payment history.
- Cash payments are recorded as `SUCCEEDED`; payOS checkout starts `PENDING` and only a
  verified, idempotent webhook can mark it successful.
- Payment amounts are positive, do not exceed the applicable order balance, and retrying an idempotency key returns the original payment.
- Refunds are limited by both their successful source payment and the order's refundable deposit balance; they support request, complete, and fail transitions.
- Rental pickup/completion calculations use the same settlement rules, without changing existing rental APIs.
- New endpoints validate requests, enforce branch access, and pass typecheck, lint, and relevant tests.

## Phases

1. Schema and authorization: added refund idempotency and database uniqueness for provider payment references. Existing `payments.read`/`payments.manage` permissions were reused.
2. Payment module: added schemas, services, authenticated routes, versioned settlement preparation, shared rental financial calculations, and router registration.
3. Verification: added route/schema tests; Prisma validation, typecheck, lint, and the complete test suite pass when run with one Vitest worker.
4. payOS follow-up: replaced manual transfer routes with checkout, reconciliation-safe
   cancellation/retry, provider-status auditing, and signed webhook handling.

## Risks

- Financial writes need idempotency and database transactions to prevent duplicate collection/refund.
- The existing rental completion path must remain backward compatible while sharing settlement calculations.

## PayOS follow-up

- Replace the public manual `BANK_TRANSFER` flow with `CASH` and `PAYMENT_GATEWAY` flows.
- Add a payOS checkout endpoint returning `checkoutUrl` and `qrCode`.
- Add an unauthenticated but signature-verified, idempotent payOS webhook endpoint.
- Remove the employee confirmation endpoint; only a verified provider webhook may succeed gateway payments.
- Keep the database `BANK_TRANSFER` enum value for backward compatibility, but do not expose it through this API.

## Progress

- Phase 1: completed.
- Phase 2: completed.
- Acceptance: 6/6 outcomes satisfied; final quality gate 197 passed, 14 skipped, 0 failed.
