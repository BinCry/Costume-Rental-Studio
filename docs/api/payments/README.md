# Payments and refunds (MVP)

Authenticated endpoints are mounted at `/api/v1/payments`. The payOS webhook is mounted at
`/api/v1/webhooks/payments/payos` and authenticates requests by signature instead of JWT.
Successful responses use `{ success: true, data, message }`.

The module supports staff-recorded cash and payOS QR checkout. There is no public manual
bank-transfer method or staff confirmation endpoint.

## Access control

Staff use branch-scoped payment permissions. A customer may read payments/refunds and create
or cancel a checkout only for their own rental order when they have the matching OWN rental
permission.

- Staff read endpoints require `payments.read` with matching branch (or ALL) scope; a
  customer instead needs `rentals.read.OWN` for the order they own.
- Cash collection, settlement preparation, and all refund actions require an active employee
  with `payments.manage` in the order branch (or ALL scope).
- Checkout creation and cancellation allow either that staff permission or the owning
  customer with `rentals.manage.OWN`.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/orders/:orderId/summary` | Calculated rental, deposit, extra-fee and refund balance. |
| GET | `/orders/:orderId` | Payments for an order. |
| POST | `/orders/:orderId/cash` | Record a successful cash payment (staff only). |
| POST | `/orders/:orderId/checkout` | Create a pending payOS payment and return QR/checkout URL. |
| POST | `/orders/:orderId/settlement` | Set final other fees and deposit deduction after return inspection. |
| GET | `/orders/:orderId/refunds` | Refunds for an order. |
| GET | `/:paymentId` | Payment detail, including refunds. |
| POST | `/:paymentId/cancel` | Cancel a pending payOS checkout. |
| POST | `/:paymentId/refunds` | Request a refund from a successful deposit payment. |
| POST | `/refunds/:refundId/complete` | Record that a requested refund was paid. |
| POST | `/refunds/:refundId/fail` | Mark a requested refund as failed. |

## Recording money received

`POST /orders/:orderId/cash` and `POST /orders/:orderId/checkout` accept the same body:

```json
{
  "purpose": "DEPOSIT",
  "amountVnd": 1000000,
  "idempotencyKey": "counter-deposit-order-123-001"
}
```

`purpose` is `RENTAL`, `DEPOSIT`, or `EXTRA`. Amounts are positive integer VND. The route,
not the caller, determines the method.

- A `CASH` payment is created as `SUCCEEDED`, with the current employee and time recorded.
- A payOS checkout is created as `PAYMENT_GATEWAY/PENDING`; its response includes
  `checkoutUrl`, `qrCode`, and optional `expiresAt`.
- Reusing an idempotency key with the identical request returns the original payment.
  Reusing it with different order, purpose, route/method, or amount returns
  `409 IDEMPOTENCY_CONFLICT`.
- The system reserves both pending and successful amounts, so a new payment cannot exceed
  the outstanding amount for that purpose.
- `RENTAL` and `DEPOSIT` are accepted only while the order is `CONFIRMED`, `PREPARING`,
  `READY_FOR_PICKUP`, `ACTIVE`, or `RETURN_INSPECTION`. `EXTRA` is accepted only during
  `RETURN_INSPECTION`. Terminal orders cannot receive payments.

Only a correctly signed successful payOS webhook whose order code, payment-link ID, currency,
and amount match can move a gateway payment to `SUCCEEDED`. Events are persisted using the
payment-link/reference pair as their idempotency identity; duplicate webhooks are acknowledged
without applying the payment again. Mismatched or terminal payments are retained for review,
not marked paid. A pending checkout may instead be cancelled with `POST /:paymentId/cancel` and
`{ "reason": "..." }`; the API cancels it at payOS before changing local state.

```text
PENDING -> SUCCEEDED   (verified payOS webhook)
PENDING -> CANCELLED   (payOS cancellation succeeds)
```

`CASH` begins at `SUCCEEDED`; successful and cancelled payments are immutable.

## payOS configuration

Configure `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`,
`PAYOS_ORDER_CODE_PREFIX`, `PAYOS_RETURN_URL`, and `PAYOS_CANCEL_URL` together. The numeric
prefix must be unique for each environment that shares a merchant account. The checkout URL
base defaults to `https://pay.payos.vn/web` and can be overridden with
`PAYOS_CHECKOUT_BASE_URL`. If provider settings are absent, cash/refund features remain available but
checkout and webhook calls return `503 PAYMENT_GATEWAY_UNAVAILABLE`. Never expose the API
key or checksum key to the frontend.

## Settlement and refunds

Before taking an `EXTRA` payment or creating a refund, staff prepare the settlement:

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

This is allowed only in `RETURN_INSPECTION`. `expectedVersion` prevents overwriting a
concurrent order change. Deposit deduction cannot exceed either the order's deposit or the
deposit actually paid. Once an extra payment or any refund exists, a changed settlement is
rejected with `409 SETTLEMENT_LOCKED`.

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

Only `SUCCEEDED` deposit payments on an order in `RETURN_INSPECTION`, `CANCELLED`, or
`NO_SHOW` are refundable. The requested amount cannot exceed the source payment or the
order's available deposit refund after deductions, completed refunds, and pending requests.
Refund idempotency follows the same rule as payment idempotency.

```text
REQUESTED -> COMPLETED  (POST /refunds/:refundId/complete)
REQUESTED -> FAILED     (POST /refunds/:refundId/fail)
```

Completion requires a unique `transactionReference`; failure requires a reason. Only
`COMPLETED` refunds reduce the amount still owed to the customer. `PROCESSING` and
`REJECTED` exist in the database enum but are not created by this MVP API.

## Summary and rental integration

`GET /orders/:orderId/summary` returns computed balances and two guards:

- `canPickup` is true only when successful `RENTAL` and `DEPOSIT` payments cover their dues.
- `canComplete` is true only when rental and extra obligations are covered and the remaining
  deposit refund is exactly zero.

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
