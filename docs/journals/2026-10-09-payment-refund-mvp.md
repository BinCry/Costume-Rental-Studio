---
date: 2026-10-09
session: payment-refund-mvp
---

# Payment and refund MVP — 2026-10-09

## Context

Rental pickup and completion already rely on financial facts, but the API initially had no
bounded workflow for staff to record money received, prepare a final settlement, or record the
return of a deposit. The follow-up phase adds customer/staff initiated payOS checkout while
preserving cash collection and manual staff refunds.

## What happened

- Added two payment-entry paths: staff-only cash, which is immediately successful, and payOS
  checkout, which remains pending until a verified provider callback.
- Customers with `rentals.read.OWN` can view financial information for their own order;
  customers with `rentals.manage.OWN` can create or cancel their own payOS checkout. Staff use
  branch-scoped `payments.read`/`payments.manage`; cash, settlement, and refunds remain staff
  actions.
- A payOS webhook verifies the provider signature, matches order code, payment-link ID,
  currency, amount, and successful result before setting a payment to `SUCCEEDED`. The
  payment-link/reference event identity and persisted webhook event make callback retries
  idempotent; suspicious events are recorded for review.
- Ambiguous checkout creation is reconciled by the stable payOS order code. The payment stays
  pending instead of being marked failed while an externally active QR may still exist.
- `providerStatus` records the observed payOS state (`INITIALIZING`, `PENDING`, `PAID`, and
  terminal states), so an idempotency-key replay can reconcile rather than create a second link.
- A valid payment received after the rental is terminal is recorded as `REVIEW_REQUIRED`
  rather than silently succeeding; provider timestamps remain in the webhook audit payload.
- payOS order codes combine a required environment prefix (1-999, unique per environment for
  the merchant account) with the local sequence. This prevents cross-environment order-code
  collisions during provider reconciliation.
- Added the six required payOS environment variables: `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`,
  `PAYOS_CHECKSUM_KEY`, `PAYOS_ORDER_CODE_PREFIX`, `PAYOS_RETURN_URL`, and
  `PAYOS_CANCEL_URL`. `PAYOS_CHECKOUT_BASE_URL` is configurable and defaults to the payOS web
  checkout origin.

## Decisions

- Cash is created as `SUCCEEDED`; payOS checkout is created as `PENDING` with a provider
  checkout URL and QR code. Manual bank-transfer confirmation is not exposed.
- Payments and refunds use idempotency keys. A replay with the same business request returns
  its original record; a reused key with different fields is rejected.
- A settlement can be prepared only after return inspection and is version-checked. It is
  locked once an extra payment or refund exists, preventing accounting changes after money
  movement.
- Refunds are limited to successful deposit payments and the amount still refundable after
  deductions, completed refunds, and pending refund requests. Only completed refunds reduce
  the amount owed to the customer.
- The payment module owns financial records. Rental lifecycle actions independently recheck
  the computed totals before pickup or completion.

## Reflection

Gateway creation is not a reliable one-shot remote call: a timeout can occur after payOS has
already created a link. Persisting a prefixed provider order code before the remote call, then
reading provider state on replay, preserves idempotency without incorrectly declaring money
failed or cancelled.

## Verification

Ran the full API suite:

```text
pnpm --filter @costume/api test
```

Result: 197 tests passed and 14 were skipped. Payment coverage includes route protection,
cash/checkout request validation, payOS client behavior, and webhook signature handling. The
suite uses mocks; it did not contact a real payOS provider or a production database.

## Next steps

Before release, run a non-production payOS integration test with configured credentials and a
non-production database. Add automated alerting and an operator workflow for
`REVIEW_REQUIRED` events before relying on the gateway for production operations.
