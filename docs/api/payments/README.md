# Payments and refunds (MVP)

Authenticated endpoints are mounted at `/api/v1/payments`. The payOS webhook is mounted at
`/api/v1/webhooks/payments/payos` and authenticates requests by signature instead of JWT.
Successful responses use `{ success: true, data, message }`.

The module supports staff-recorded cash and bank transfers, plus payOS QR checkout. Staff
record a bank transfer only after confirming that the money reached the Studio account.

## Access control

Staff use branch-scoped payment permissions. A customer may read payments/refunds and create
or cancel a checkout only for their own rental order when they have the matching OWN rental
permission.

- Staff read endpoints require `payments.read` with matching branch (or ALL) scope; a
  customer instead needs `rentals.read.OWN` for the order they own.
- Cash collection and staff-recorded bank transfers require `payments.collect` or
  `payments.manage` in the order branch (or ALL scope).
- Settlement preparation and refund creation require an active employee with
  `payments.manage` in the order branch (or ALL scope).
- Completing or failing a refund requires `refunds.approve` or `payments.manage` in the
  order branch (or ALL scope).
- Checkout creation and cancellation allow either staff with `payments.manage` or the
  owning customer with `rentals.manage.OWN`.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/orders/:orderId/summary` | Calculated rental, deposit, extra-fee and refund balance. |
| GET | `/orders/:orderId` | Payments for an order. |
| POST | `/orders/:orderId/cash` | Record a successful cash payment (staff only). |
| POST | `/orders/:orderId/bank-transfer` | Record a successful bank transfer after staff verification. |
| POST | `/orders/:orderId/checkout` | Create a pending payOS payment and return QR/checkout URL. |
| POST | `/orders/:orderId/settlement` | Prepare the final other fees and deposit deduction after assessment. |
| GET | `/orders/:orderId/refunds` | Refunds for an order. |
| GET | `/:paymentId` | Payment detail, including refunds. |
| POST | `/:paymentId/cancel` | Cancel a pending payOS checkout. |
| POST | `/:paymentId/refunds` | Request a refund from a successful deposit payment. |
| POST | `/refunds/:refundId/complete` | Record that a requested/processing refund was paid. |
| POST | `/refunds/:refundId/fail` | Mark a requested/processing refund as failed. |

## Recording money received

Cash and payOS checkout accept `purpose`, `amountVnd`, and `idempotencyKey`:

```json
{
  "purpose": "DEPOSIT",
  "amountVnd": 1000000,
  "idempotencyKey": "counter-deposit-order-123-001"
}
```

The bank-transfer endpoint accepts the same fields and a required `transactionReference`:

```json
{
  "purpose": "EXTRA",
  "amountVnd": 250000,
  "transactionReference": "FT260101012345",
  "idempotencyKey": "counter-extra-order-123-001"
}
```

`purpose` is `RENTAL`, `DEPOSIT`, or `EXTRA`. Amounts are positive integer VND. The
route determines the payment method.

- A cash or verified bank-transfer payment is created as `SUCCEEDED`, with the current
  employee and time recorded.
- A payOS checkout is created as `PAYMENT_GATEWAY/PENDING`; its response includes
  `checkoutUrl`, `qrCode`, and optional `expiresAt`.
- Reusing an idempotency key with the identical request returns the original payment.
  Reusing it with a different order, purpose, route/method, amount, or bank reference returns
  an idempotency conflict.
- Pending and successful payments reserve balance, so a new payment cannot exceed the
  outstanding amount for that purpose.
- `RENTAL` and `DEPOSIT` payments are accepted while the order is
  `CONFIRMED`, `PREPARING`, `READY_FOR_PICKUP`, `ACTIVE`, or
  `RETURN_INSPECTION`.
- `EXTRA` is accepted while the order is `ACTIVE`; in `RETURN_INSPECTION`, the return
  assessment must be complete first. Pending/processing EXTRA payments must be resolved before
  assessment. Terminal orders cannot receive payments.

Only a correctly signed successful payOS webhook whose order code, payment-link ID, currency,
and amount match can move a gateway payment to `SUCCEEDED`. Events are persisted using the
payment-link/reference pair as their idempotency identity; duplicate webhooks are acknowledged
without applying the payment again. Mismatched or terminal payments are retained for review,
not marked paid. A pending checkout may instead be cancelled with `POST /:paymentId/cancel`
and `{ "reason": "..." }`; the API cancels it at payOS before changing local state.

```text
PENDING -> SUCCEEDED   (verified payOS webhook)
PENDING -> CANCELLED   (payOS cancellation succeeds)
```

Cash and verified bank-transfer payments begin at `SUCCEEDED`; successful and cancelled
payments are immutable.

## payOS configuration

Configure `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`,
`PAYOS_ORDER_CODE_PREFIX`, `PAYOS_RETURN_URL`, and `PAYOS_CANCEL_URL` together. The numeric
prefix must be unique for each environment that shares a merchant account. The checkout URL
base defaults to `https://pay.payos.vn/web` and can be overridden with
`PAYOS_CHECKOUT_BASE_URL`. If provider settings are absent, cash/refund features remain
available but checkout and webhook calls return `503 PAYMENT_GATEWAY_UNAVAILABLE`. Never
expose the API key or checksum key to the frontend.

## Settlement and refunds

A return must be assessed before settlement preparation or a refund request in
`RETURN_INSPECTION`. Settlement preparation uses:

```http
POST /orders/:orderId/settlement
```

```json
{
  "expectedVersion": 4,
  "otherFeeVnd": 50000,
  "depositDeductionVnd": 200000,
  "settlementNote": "Torn sleeve"
}
```

The order must be in `RETURN_INSPECTION`, with assessment complete.
`expectedVersion` prevents overwriting a concurrent order change. Deposit deduction cannot
exceed either the order's deposit or the deposit actually paid. A changed settlement is
rejected with `409 SETTLEMENT_LOCKED` once there is a pending EXTRA payment, a successful
EXTRA collected after return, or a refund in `REQUESTED`, `PROCESSING`, or
`COMPLETED` status. Successful extension charges collected before return remain part of the
order balance but do not lock assessment or settlement changes.

Create a refund from a successful `DEPOSIT` payment:

```http
POST /:paymentId/refunds
```

```json
{
  "amountVnd": 800000,
  "reason": "Return remaining deposit",
  "idempotencyKey": "refund-order-123-001"
}
```

Only successful deposit payments on orders in `RETURN_INSPECTION`, `CANCELLED`, or
`NO_SHOW` can be refunded. In `RETURN_INSPECTION`, the return assessment must be complete.
The requested amount cannot exceed the source payment or the available deposit refund after
deductions, completed refunds, and pending requests. Refund idempotency follows the same rule
as payment idempotency.

```text
REQUESTED  -> COMPLETED  (POST /refunds/:refundId/complete)
PROCESSING -> COMPLETED  (POST /refunds/:refundId/complete)
REQUESTED  -> FAILED     (POST /refunds/:refundId/fail)
PROCESSING -> FAILED     (POST /refunds/:refundId/fail)
```

Completion requires a unique `transactionReference`; failure requires a reason. Only
`COMPLETED` refunds reduce the amount still owed to the customer. `REJECTED` exists in the
database enum but is not created by this MVP API.

## Summary and rental integration

`GET /orders/:orderId/summary` returns computed balances and two guards:

- `canPickup` is true only when successful `RENTAL` and `DEPOSIT` payments cover their dues.
- `canComplete` is true only when rental payments cover rent, successful EXTRA payments equal
  the extra-fee balance after deposit deduction, and the remaining deposit refund is exactly
  zero.

The rental module independently rechecks these financial facts in its pickup and completion
operations. A frontend summary is informational and cannot authorize a lifecycle transition.

## Common errors

- `400 VALIDATION_ERROR`: malformed UUID or body.
- `403`: missing employee account, permission, or branch scope.
- `404 RENTAL_ORDER_NOT_FOUND`, `PAYMENT_NOT_FOUND`, or `REFUND_NOT_FOUND`.
- `409 PAYMENT_NOT_ALLOWED`, `PAYMENT_AMOUNT_EXCEEDS_BALANCE`,
  `INVALID_PAYMENT_TRANSITION`, `SETTLEMENT_NOT_ALLOWED`, `SETTLEMENT_LOCKED`,
  `REFUND_NOT_ALLOWED`, `REFUND_AMOUNT_EXCEEDS_BALANCE`, or idempotency/reference conflicts.
- `502 PAYMENT_GATEWAY_ERROR`: payOS rejected or could not complete the upstream operation.
- `502 PAYMENT_GATEWAY_STATUS_UNKNOWN`: creation had an ambiguous result; retry the same
  idempotency key so the API can reconcile by payOS order code without reserving twice.
- `503 PAYMENT_GATEWAY_UNAVAILABLE`: the server has no complete payOS configuration.

## Verification boundary

The automated suite verifies the API flow with mocked payOS calls and does not contact a real
payOS account or a production database. Configure non-production payOS credentials first when
performing an integration test.
