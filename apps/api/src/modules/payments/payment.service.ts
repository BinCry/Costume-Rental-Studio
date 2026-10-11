import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  damageDueVnd,
  depositDueVnd,
  rentalDueBeforeExtensionsVnd,
  successfulPaymentTotal,
} from '../rentals/rental-financials.js';
import {
  assertPermission,
  hasPermission,
  requireActor,
  type AuthenticatedActor,
} from '../auth/authorization.js';
import type {
  CancelPaymentInput,
  CreateBankTransferPaymentInput,
  CompleteRefundInput,
  CreatePaymentInput,
  CreateRefundInput,
  FailRefundInput,
  PrepareSettlementInput,
} from './payment.schema.js';
import {
  cancelPayosCheckout,
  createPayosCheckout,
  getPayosCheckout,
  verifyPayosWebhook,
} from './payos.gateway.js';

const transactionOptions = { maxWait: 10_000, timeout: 20_000 } as const;
const terminalOrderStatuses = ['COMPLETED', 'CANCELLED', 'REJECTED', 'NO_SHOW'];
const paymentOrderStatuses = [
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'ACTIVE',
  'RETURN_INSPECTION',
];
const refundableOrderStatuses = ['RETURN_INSPECTION', 'CANCELLED', 'NO_SHOW'];

function orderInclude() {
  return {
    items: { include: { accessories: true } },
    payments: { include: { refunds: true }, orderBy: { createdAt: 'asc' } },
  } satisfies Prisma.RentalOrderInclude;
}

function paymentInclude() {
  return {
    refunds: { orderBy: { createdAt: 'asc' } },
    order: { select: { id: true, pickupBranchId: true, customerUserId: true } },
  } satisfies Prisma.PaymentInclude;
}

function requireEmployee(actor: AuthenticatedActor) {
  requireActor(actor);
  if (!actor.employee)
    throw new AppError(403, 'EMPLOYEE_REQUIRED', 'A current employee account is required');
  return actor;
}

function canOwn(actor: AuthenticatedActor, action: 'read' | 'manage', customerUserId: string) {
  return (
    actor.id === customerUserId && hasPermission(actor, { module: 'rentals', action, scope: 'OWN' })
  );
}

function assertRead(
  actor: AuthenticatedActor,
  order: { customerUserId: string; pickupBranchId: string },
) {
  requireActor(actor);
  if (
    !canOwn(actor, 'read', order.customerUserId) &&
    !hasPermission(actor, { module: 'payments', action: 'read', branchId: order.pickupBranchId })
  )
    throw new AppError(403, 'FORBIDDEN', 'Permission denied for this payment');
}

function assertManage(actor: AuthenticatedActor, branchId: string) {
  requireEmployee(actor);
  return assertPermission(actor, { module: 'payments', action: 'manage', branchId });
}
function assertCollect(actor: AuthenticatedActor, branchId: string) {
  requireEmployee(actor);
  if (
    !hasPermission(actor, { module: 'payments', action: 'collect', branchId }) &&
    !hasPermission(actor, { module: 'payments', action: 'manage', branchId })
  )
    throw new AppError(403, 'FORBIDDEN', 'Permission denied for payment collection');
}
function assertRefundApproval(actor: AuthenticatedActor, branchId: string) {
  requireEmployee(actor);
  if (
    !hasPermission(actor, { module: 'refunds', action: 'approve', branchId }) &&
    !hasPermission(actor, { module: 'payments', action: 'manage', branchId })
  )
    throw new AppError(403, 'FORBIDDEN', 'Permission denied for refund approval');
}

function assertCheckout(
  actor: AuthenticatedActor,
  order: { customerUserId: string; pickupBranchId: string },
) {
  requireActor(actor);
  if (canOwn(actor, 'manage', order.customerUserId)) return;
  assertManage(actor, order.pickupBranchId);
}

async function findOrder(orderId: string) {
  const order = await prisma.rentalOrder.findUnique({
    where: { id: orderId },
    include: orderInclude(),
  });
  if (!order) throw new AppError(404, 'RENTAL_ORDER_NOT_FOUND', 'Rental order not found');
  return order;
}

async function lockOrder(tx: Prisma.TransactionClient, orderId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM rental_orders WHERE id = ${orderId}::uuid FOR UPDATE
  `;
  if (!rows.length) throw new AppError(404, 'RENTAL_ORDER_NOT_FOUND', 'Rental order not found');
  return tx.rentalOrder.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude() });
}

async function lockPayment(tx: Prisma.TransactionClient, paymentId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE
  `;
  if (!rows.length) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
  return tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { refunds: true } });
}

async function lockRefund(tx: Prisma.TransactionClient, refundId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM refunds WHERE id = ${refundId}::uuid FOR UPDATE
  `;
  if (!rows.length) throw new AppError(404, 'REFUND_NOT_FOUND', 'Refund not found');
  return tx.refund.findUniqueOrThrow({ where: { id: refundId }, include: { payment: true } });
}

function assertPaymentOrderStatus(status: string, purpose: CreatePaymentInput['purpose']) {
  if (terminalOrderStatuses.includes(status))
    throw new AppError(409, 'PAYMENT_NOT_ALLOWED', 'Payments are not allowed for a terminal order');
  if (!paymentOrderStatuses.includes(status))
    throw new AppError(409, 'PAYMENT_NOT_ALLOWED', 'The rental order is not ready for payment');
  if (purpose === 'EXTRA' && !['ACTIVE', 'RETURN_INSPECTION'].includes(status))
    throw new AppError(
      409,
      'PAYMENT_NOT_ALLOWED',
      'Extra payments are allowed for an active rental or after return inspection',
    );
}

function assertVersion(current: number, expected: number) {
  if (current !== expected)
    throw new AppError(409, 'ORDER_VERSION_CONFLICT', 'Order was changed by another request');
}

function paymentDue(
  order: Prisma.RentalOrderGetPayload<{ include: ReturnType<typeof orderInclude> }>,
  purpose: CreatePaymentInput['purpose'],
) {
  if (purpose === 'RENTAL')
    return rentalDueBeforeExtensionsVnd(
      order.items,
      order.promotionDiscountVnd,
      order.additionalRentalFeeVnd,
    );
  if (purpose === 'DEPOSIT') return depositDueVnd(order.items);
  return (
    order.additionalRentalFeeVnd + damageDueVnd(order.items) + order.lateFeeVnd + order.otherFeeVnd
  );
}

function reservedForPurpose(
  payments: { amountVnd: bigint; purpose: string; status: string }[],
  purpose: CreatePaymentInput['purpose'],
) {
  return payments
    .filter(
      (payment) => payment.purpose === purpose && ['SUCCEEDED', 'PENDING'].includes(payment.status),
    )
    .reduce((sum, payment) => sum + payment.amountVnd, 0n);
}

function isUnique(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function idempotencyConflict() {
  throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key belongs to a different request');
}

function assertSamePaymentRequest(
  payment: { orderId: string; purpose: string; method: string; amountVnd: bigint },
  orderId: string,
  input: CreatePaymentInput,
  method: 'CASH' | 'PAYMENT_GATEWAY',
) {
  if (
    payment.orderId !== orderId ||
    payment.purpose !== input.purpose ||
    payment.method !== method ||
    payment.amountVnd !== input.amountVnd
  )
    idempotencyConflict();
}

function assertSameBankTransferRequest(
  payment: {
    orderId: string;
    purpose: string;
    method: string;
    amountVnd: bigint;
    transactionReference: string | null;
  },
  orderId: string,
  input: CreateBankTransferPaymentInput,
) {
  if (
    payment.orderId !== orderId ||
    payment.purpose !== input.purpose ||
    payment.method !== 'BANK_TRANSFER' ||
    payment.amountVnd !== input.amountVnd ||
    payment.transactionReference !== input.transactionReference
  )
    idempotencyConflict();
}

function assertSameRefundRequest(
  refund: { paymentId: string; amountVnd: bigint; reason: string },
  paymentId: string,
  input: CreateRefundInput,
) {
  if (
    refund.paymentId !== paymentId ||
    refund.amountVnd !== input.amountVnd ||
    refund.reason !== input.reason
  )
    idempotencyConflict();
}

function settlement(
  order: Prisma.RentalOrderGetPayload<{ include: ReturnType<typeof orderInclude> }>,
) {
  const rentalDue = rentalDueBeforeExtensionsVnd(
    order.items,
    order.promotionDiscountVnd,
    order.additionalRentalFeeVnd,
  );
  const depositDue = depositDueVnd(order.items);
  const extraDue =
    order.additionalRentalFeeVnd + damageDueVnd(order.items) + order.lateFeeVnd + order.otherFeeVnd;
  const paidRental = successfulPaymentTotal(order.payments, 'RENTAL');
  const paidDeposit = successfulPaymentTotal(order.payments, 'DEPOSIT');
  const paidExtra = successfulPaymentTotal(order.payments, 'EXTRA');
  const refunds = order.payments.flatMap((payment) => payment.refunds);
  const completedRefund = refunds
    .filter((refund) => refund.status === 'COMPLETED')
    .reduce((sum, refund) => sum + refund.amountVnd, 0n);
  const pendingRefund = refunds
    .filter((refund) => ['REQUESTED', 'PROCESSING'].includes(refund.status))
    .reduce((sum, refund) => sum + refund.amountVnd, 0n);
  const refundableBeforeRefunds = paidDeposit - order.depositDeductionVnd;
  const refundRemainingVnd = refundableBeforeRefunds - completedRefund;
  const refundAvailableVnd = refundableBeforeRefunds - completedRefund - pendingRefund;
  const rentalRemainingVnd = rentalDue - paidRental;
  const depositRemainingVnd = depositDue - paidDeposit;
  const extraRemainingVnd = extraDue - paidExtra - order.depositDeductionVnd;
  const outstandingVnd =
    (rentalRemainingVnd > 0n ? rentalRemainingVnd : 0n) +
    (extraRemainingVnd > 0n ? extraRemainingVnd : 0n);

  return {
    rental: { dueVnd: rentalDue, paidVnd: paidRental, remainingVnd: rentalRemainingVnd },
    deposit: {
      dueVnd: depositDue,
      paidVnd: paidDeposit,
      deductionVnd: order.depositDeductionVnd,
      refundedVnd: completedRefund,
      refundRemainingVnd,
      refundAvailableVnd: refundAvailableVnd > 0n ? refundAvailableVnd : 0n,
    },
    extra: { dueVnd: extraDue, paidVnd: paidExtra, remainingVnd: extraRemainingVnd },
    outstandingVnd,
    canPickup: rentalRemainingVnd <= 0n && depositRemainingVnd <= 0n,
    canComplete: rentalRemainingVnd <= 0n && extraRemainingVnd <= 0n && refundRemainingVnd === 0n,
  };
}

export async function getSettlement(actor: AuthenticatedActor, orderId: string) {
  const order = await findOrder(orderId);
  assertRead(actor, order);
  return { orderId: order.id, status: order.status, ...settlement(order) };
}

export async function listPayments(actor: AuthenticatedActor, orderId: string) {
  const order = await findOrder(orderId);
  assertRead(actor, order);
  return order.payments;
}

export async function listRefunds(actor: AuthenticatedActor, orderId: string) {
  const order = await findOrder(orderId);
  assertRead(actor, order);
  return order.payments.flatMap((payment) =>
    payment.refunds.map((refund) => ({ ...refund, paymentId: payment.id })),
  );
}

export async function getPayment(actor: AuthenticatedActor, paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: paymentInclude(),
  });
  if (!payment) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
  assertRead(actor, payment.order);
  return payment;
}

export async function createCashPayment(
  actor: AuthenticatedActor,
  orderId: string,
  input: CreatePaymentInput,
) {
  requireEmployee(actor);
  const existing = await prisma.payment.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) {
    assertSamePaymentRequest(existing, orderId, input, 'CASH');
    const payment = await getPayment(actor, existing.id);
    assertCollect(actor, payment.order.pickupBranchId);
    return payment;
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, orderId);
      assertCollect(actor, order.pickupBranchId);
      assertPaymentOrderStatus(order.status, input.purpose);
      const due = paymentDue(order, input.purpose);
      const reserved = reservedForPurpose(order.payments, input.purpose);
      if (due - reserved < input.amountVnd)
        throw new AppError(
          409,
          'PAYMENT_AMOUNT_EXCEEDS_BALANCE',
          'Payment exceeds the outstanding balance',
        );
      return tx.payment.create({
        data: {
          orderId,
          purpose: input.purpose,
          method: 'CASH',
          amountVnd: input.amountVnd,
          idempotencyKey: input.idempotencyKey,
          status: 'SUCCEEDED',
          recordedBy: actor.id,
          paidAt: new Date(),
        },
        include: paymentInclude(),
      });
    }, transactionOptions);
  } catch (error) {
    if (!isUnique(error)) throw error;
    const payment = await prisma.payment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (!payment) throw error;
    assertSamePaymentRequest(payment, orderId, input, 'CASH');
    return getPayment(actor, payment.id);
  }
}

export async function createBankTransferPayment(
  actor: AuthenticatedActor,
  orderId: string,
  input: CreateBankTransferPaymentInput,
) {
  requireEmployee(actor);
  const existing = await prisma.payment.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) {
    assertSameBankTransferRequest(existing, orderId, input);
    const payment = await getPayment(actor, existing.id);
    assertCollect(actor, payment.order.pickupBranchId);
    return payment;
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, orderId);
      assertCollect(actor, order.pickupBranchId);
      assertPaymentOrderStatus(order.status, input.purpose);
      const due = paymentDue(order, input.purpose);
      const reserved = reservedForPurpose(order.payments, input.purpose);
      if (due - reserved < input.amountVnd)
        throw new AppError(
          409,
          'PAYMENT_AMOUNT_EXCEEDS_BALANCE',
          'Payment exceeds the outstanding balance',
        );
      return tx.payment.create({
        data: {
          orderId,
          purpose: input.purpose,
          method: 'BANK_TRANSFER',
          amountVnd: input.amountVnd,
          transactionReference: input.transactionReference,
          idempotencyKey: input.idempotencyKey,
          status: 'SUCCEEDED',
          recordedBy: actor.id,
          paidAt: new Date(),
        },
        include: paymentInclude(),
      });
    }, transactionOptions);
  } catch (error) {
    if (!isUnique(error)) throw error;
    const payment = await prisma.payment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (!payment) {
      const referenceConflict = await prisma.payment.findFirst({
        where: { method: 'BANK_TRANSFER', transactionReference: input.transactionReference },
        select: { id: true },
      });
      if (referenceConflict)
        throw new AppError(
          409,
          'BANK_TRANSFER_REFERENCE_CONFLICT',
          'Bank transfer transaction reference already exists',
        );
      throw error;
    }
    assertSameBankTransferRequest(payment, orderId, input);
    return getPayment(actor, payment.id);
  }
}

function gatewayAmount(amountVnd: bigint) {
  if (amountVnd > BigInt(Number.MAX_SAFE_INTEGER))
    throw new AppError(400, 'INVALID_PAYMENT_AMOUNT', 'Payment amount is too large for payOS');
  return Number(amountVnd);
}

function checkoutResponse(payment: Awaited<ReturnType<typeof getPayment>>) {
  return {
    payment,
    checkoutUrl: payment.checkoutUrl,
    qrCode: payment.qrCode,
    expiresAt: payment.expiresAt,
  };
}

async function initializePayosCheckout(payment: {
  id: string;
  providerOrderCode: bigint | null;
  providerPaymentId: string | null;
  amountVnd: bigint;
}) {
  const orderCode = Number(payment.providerOrderCode);
  if (!Number.isSafeInteger(orderCode))
    throw new AppError(500, 'PAYMENT_ORDER_CODE_FAILED', 'Invalid payment order code');

  let checkout;
  if (payment.providerPaymentId) {
    try {
      checkout = await getPayosCheckout(orderCode);
    } catch {
      throw new AppError(
        502,
        'PAYMENT_GATEWAY_STATUS_UNKNOWN',
        'payOS checkout status is unknown; retry with the same idempotency key',
      );
    }
  } else {
    try {
      checkout = await createPayosCheckout({
        orderCode,
        amountVnd: gatewayAmount(payment.amountVnd),
        description: `CRS ${orderCode}`,
      });
    } catch (creationError) {
      if (creationError instanceof AppError) throw creationError;
      try {
        checkout = await getPayosCheckout(orderCode);
      } catch {
        throw new AppError(
          502,
          'PAYMENT_GATEWAY_STATUS_UNKNOWN',
          'payOS checkout status is unknown; retry with the same idempotency key',
        );
      }
    }
  }

  if (checkout.orderCode !== orderCode || checkout.amountVnd !== Number(payment.amountVnd))
    throw new AppError(
      409,
      'PAYMENT_RECONCILIATION_REQUIRED',
      'The payOS payment link does not match this payment',
    );

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      providerPaymentId: checkout.paymentLinkId,
      providerStatus: checkout.status,
      checkoutUrl: checkout.checkoutUrl,
      qrCode: checkout.qrCode,
      expiresAt: checkout.expiredAt,
      failureReason: null,
      ...(checkout.status === 'CANCELLED' ? { status: 'CANCELLED' as const } : {}),
      ...(['EXPIRED', 'FAILED'].includes(checkout.status) ? { status: 'FAILED' as const } : {}),
    },
    include: paymentInclude(),
  });
  if (checkout.status === 'PENDING') return updated;
  throw new AppError(
    409,
    'PAYMENT_RECONCILIATION_REQUIRED',
    `The payOS payment link is ${checkout.status}; wait for reconciliation`,
  );
}

export async function createCheckout(
  actor: AuthenticatedActor,
  orderId: string,
  input: CreatePaymentInput,
) {
  gatewayAmount(input.amountVnd);
  const existing = await prisma.payment.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) {
    assertSamePaymentRequest(existing, orderId, input, 'PAYMENT_GATEWAY');
    const payment = await getPayment(actor, existing.id);
    assertCheckout(actor, payment.order);
    if (
      payment.status === 'PENDING' &&
      (!payment.providerPaymentId || payment.providerStatus !== 'PENDING')
    )
      return checkoutResponse(await initializePayosCheckout(payment));
    return checkoutResponse(payment);
  }

  const orderCodePrefix = env.PAYOS_ORDER_CODE_PREFIX;
  if (!orderCodePrefix)
    throw new AppError(503, 'PAYMENT_GATEWAY_UNAVAILABLE', 'payOS is not configured');

  let payment;
  try {
    payment = await prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, orderId);
      assertCheckout(actor, order);
      assertPaymentOrderStatus(order.status, input.purpose);
      const due = paymentDue(order, input.purpose);
      const reserved = reservedForPurpose(order.payments, input.purpose);
      if (due - reserved < input.amountVnd)
        throw new AppError(
          409,
          'PAYMENT_AMOUNT_EXCEEDS_BALANCE',
          'Payment exceeds the outstanding balance',
        );
      const orderCodes = await tx.$queryRaw<{ orderCode: bigint }[]>`
        SELECT nextval('payment_provider_order_code_seq') AS "orderCode"
      `;
      const sequence = orderCodes[0]?.orderCode;
      if (!sequence)
        throw new AppError(500, 'PAYMENT_ORDER_CODE_FAILED', 'Could not create payment order code');
      const orderCode = BigInt(orderCodePrefix) * 1_000_000_000_000n + sequence;
      return tx.payment.create({
        data: {
          orderId,
          purpose: input.purpose,
          method: 'PAYMENT_GATEWAY',
          amountVnd: input.amountVnd,
          idempotencyKey: input.idempotencyKey,
          status: 'PENDING',
          provider: 'PAYOS',
          providerStatus: 'INITIALIZING',
          providerOrderCode: orderCode,
          recordedBy: actor.employee ? actor.id : null,
        },
        include: paymentInclude(),
      });
    }, transactionOptions);
  } catch (error) {
    if (!isUnique(error)) throw error;
    const duplicate = await prisma.payment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (!duplicate) throw error;
    assertSamePaymentRequest(duplicate, orderId, input, 'PAYMENT_GATEWAY');
    const loaded = await getPayment(actor, duplicate.id);
    assertCheckout(actor, loaded.order);
    if (
      loaded.status === 'PENDING' &&
      (!loaded.providerPaymentId || loaded.providerStatus !== 'PENDING')
    )
      return checkoutResponse(await initializePayosCheckout(loaded));
    return checkoutResponse(loaded);
  }

  return checkoutResponse(await initializePayosCheckout(payment));
}

export async function prepareSettlement(
  actor: AuthenticatedActor,
  orderId: string,
  input: PrepareSettlementInput,
) {
  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    assertManage(actor, order.pickupBranchId);
    if (order.status !== 'RETURN_INSPECTION')
      throw new AppError(
        409,
        'SETTLEMENT_NOT_ALLOWED',
        'Settlement can be prepared after return inspection',
      );
    if (order.inspectionStatus === 'PENDING_ASSESSMENT')
      throw new AppError(
        409,
        'ASSESSMENT_REQUIRED',
        'Return assessment must be completed before settlement',
      );
    assertVersion(order.version, input.expectedVersion);
    const deposits = depositDueVnd(order.items);
    const paidDeposit = successfulPaymentTotal(order.payments, 'DEPOSIT');
    if (input.depositDeductionVnd > deposits || input.depositDeductionVnd > paidDeposit)
      throw new AppError(
        400,
        'INVALID_DEPOSIT_DEDUCTION',
        'Deposit deduction exceeds the paid deposit',
      );
    const hasFinancialActivity =
      order.payments.some(
        (payment) =>
          payment.purpose === 'EXTRA' && ['PENDING', 'SUCCEEDED'].includes(payment.status),
      ) || order.payments.some((payment) => payment.refunds.length > 0);
    const settlementChanged =
      order.otherFeeVnd !== input.otherFeeVnd ||
      order.depositDeductionVnd !== input.depositDeductionVnd ||
      (order.settlementNote ?? null) !== (input.settlementNote ?? null);
    if (hasFinancialActivity && settlementChanged)
      throw new AppError(
        409,
        'SETTLEMENT_LOCKED',
        'Settlement cannot change after an extra payment or refund exists',
      );
    return tx.rentalOrder.update({
      where: { id: order.id },
      data: {
        otherFeeVnd: input.otherFeeVnd,
        depositDeductionVnd: input.depositDeductionVnd,
        settlementNote: input.settlementNote ?? null,
        version: { increment: 1 },
      },
      include: orderInclude(),
    });
  }, transactionOptions);
}

export async function cancelPayment(
  actor: AuthenticatedActor,
  paymentId: string,
  input: CancelPaymentInput,
) {
  const target = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: paymentInclude(),
  });
  if (!target) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
  assertCheckout(actor, target.order);
  if (target.status === 'CANCELLED') return target;
  if (
    target.status !== 'PENDING' ||
    target.method !== 'PAYMENT_GATEWAY' ||
    target.provider !== 'PAYOS' ||
    !target.providerPaymentId
  )
    throw new AppError(
      409,
      'INVALID_PAYMENT_TRANSITION',
      'Only pending payOS payments can be cancelled',
    );
  const orderCode = Number(target.providerOrderCode);
  if (!Number.isSafeInteger(orderCode))
    throw new AppError(
      409,
      'PAYMENT_RECONCILIATION_REQUIRED',
      'Payment has no valid payOS order code',
    );
  let providerState;
  try {
    providerState = await cancelPayosCheckout(target.providerPaymentId, input.reason);
  } catch (error) {
    if (error instanceof AppError) throw error;
    try {
      providerState = await getPayosCheckout(orderCode);
    } catch {
      throw new AppError(
        502,
        'PAYMENT_GATEWAY_STATUS_UNKNOWN',
        'payOS cancellation status is unknown; retry this cancellation',
      );
    }
  }
  if (
    providerState.paymentLinkId !== target.providerPaymentId ||
    providerState.orderCode !== orderCode ||
    providerState.amountVnd !== Number(target.amountVnd)
  )
    throw new AppError(
      409,
      'PAYMENT_RECONCILIATION_REQUIRED',
      'payOS cancellation does not match this payment',
    );
  if (providerState.status === 'PAID')
    throw new AppError(409, 'PAYMENT_ALREADY_PAID', 'payOS reports this payment as paid');
  if (providerState.status !== 'CANCELLED')
    throw new AppError(
      409,
      'PAYMENT_CANCELLATION_NOT_CONFIRMED',
      'payOS did not confirm cancellation',
    );
  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, target.orderId);
    assertCheckout(actor, order);
    const payment = await lockPayment(tx, paymentId);
    if (payment.status !== 'PENDING' || payment.method !== 'PAYMENT_GATEWAY')
      throw new AppError(
        409,
        'INVALID_PAYMENT_TRANSITION',
        'Only pending payments can be cancelled',
      );
    return tx.payment.update({
      where: { id: payment.id },
      data: { status: 'CANCELLED', providerStatus: 'CANCELLED', failureReason: input.reason },
      include: paymentInclude(),
    });
  }, transactionOptions);
}

export async function handlePayosWebhook(payload: unknown) {
  const data = await verifyPayosWebhook(payload);
  const eventId = `${data.paymentLinkId}:${data.reference}`;
  const payloadJson = JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue;
  const prior = await prisma.providerWebhookEvent.findFirst({
    where: { provider: 'PAYOS', eventId },
  });
  if (prior) return { processed: false, reason: 'duplicate', status: prior.processingStatus };

  const target = await prisma.payment.findFirst({
    where: { provider: 'PAYOS', providerOrderCode: BigInt(data.orderCode) },
    select: { id: true, orderId: true },
  });
  if (!target) {
    try {
      await prisma.providerWebhookEvent.create({
        data: {
          provider: 'PAYOS',
          eventId,
          eventType: data.code === '00' ? 'PAYMENT_SUCCEEDED' : 'PAYMENT_NOTIFICATION',
          payloadJson,
          processedAt: new Date(),
          processingStatus: 'IGNORED',
          errorMessage: 'Payment not found',
        },
      });
    } catch (error) {
      if (!isUnique(error)) throw error;
    }
    return { processed: false, reason: 'payment_not_found', status: 'IGNORED' };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, target.orderId);
      const payment = await lockPayment(tx, target.id);
      const eventBase = {
        paymentId: payment.id,
        provider: 'PAYOS',
        eventId,
        eventType: data.code === '00' ? 'PAYMENT_SUCCEEDED' : 'PAYMENT_NOTIFICATION',
        payloadJson,
        processedAt: new Date(),
      } satisfies Omit<Prisma.ProviderWebhookEventUncheckedCreateInput, 'processingStatus'>;

      if (
        data.code !== '00' ||
        data.currency !== 'VND' ||
        BigInt(data.amount) !== payment.amountVnd ||
        payment.method !== 'PAYMENT_GATEWAY' ||
        payment.provider !== 'PAYOS' ||
        (payment.providerPaymentId !== null && payment.providerPaymentId !== data.paymentLinkId)
      ) {
        await tx.providerWebhookEvent.create({
          data: {
            ...eventBase,
            processingStatus: 'REVIEW_REQUIRED',
            errorMessage: 'Webhook data does not match the pending payment',
          },
        });
        return { processed: false, reason: 'payment_mismatch', status: 'REVIEW_REQUIRED' };
      }

      if (payment.status === 'SUCCEEDED') {
        await tx.providerWebhookEvent.create({
          data: { ...eventBase, processingStatus: 'PROCESSED' },
        });
        return { processed: false, reason: 'already_succeeded', status: 'PROCESSED' };
      }
      if (payment.status !== 'PENDING') {
        await tx.providerWebhookEvent.create({
          data: {
            ...eventBase,
            processingStatus: 'REVIEW_REQUIRED',
            errorMessage: `Payment is already ${payment.status}`,
          },
        });
        return { processed: false, reason: 'terminal_payment', status: 'REVIEW_REQUIRED' };
      }

      if (terminalOrderStatuses.includes(order.status)) {
        await tx.providerWebhookEvent.create({
          data: {
            ...eventBase,
            processingStatus: 'REVIEW_REQUIRED',
            errorMessage: `Rental order is already ${order.status}`,
          },
        });
        return { processed: false, reason: 'terminal_order', status: 'REVIEW_REQUIRED' };
      }

      const due = paymentDue(order, payment.purpose);
      const paid = successfulPaymentTotal(order.payments, payment.purpose);
      if (due - paid < payment.amountVnd) {
        await tx.providerWebhookEvent.create({
          data: {
            ...eventBase,
            processingStatus: 'REVIEW_REQUIRED',
            errorMessage: 'Payment exceeds the outstanding balance',
          },
        });
        return { processed: false, reason: 'amount_exceeds_balance', status: 'REVIEW_REQUIRED' };
      }

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'SUCCEEDED',
          providerStatus: 'PAID',
          providerPaymentId: data.paymentLinkId,
          paidAt: new Date(),
          failureReason: null,
        },
      });
      await tx.providerWebhookEvent.create({
        data: { ...eventBase, processingStatus: 'PROCESSED' },
      });
      return { processed: true, status: 'PROCESSED' };
    }, transactionOptions);
  } catch (error) {
    if (!isUnique(error)) throw error;
    const duplicate = await prisma.providerWebhookEvent.findFirst({
      where: { provider: 'PAYOS', eventId },
    });
    return {
      processed: false,
      reason: 'duplicate',
      status: duplicate?.processingStatus ?? 'PROCESSED',
    };
  }
}

export async function createRefund(
  actor: AuthenticatedActor,
  paymentId: string,
  input: CreateRefundInput,
) {
  requireEmployee(actor);
  const existing = await prisma.refund.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) {
    assertSameRefundRequest(existing, paymentId, input);
    const payment = await getPayment(actor, existing.paymentId);
    assertManage(actor, payment.order.pickupBranchId);
    return existing;
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const target = await tx.payment.findUnique({
        where: { id: paymentId },
        select: { orderId: true },
      });
      if (!target) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
      const order = await lockOrder(tx, target.orderId);
      assertManage(actor, order.pickupBranchId);
      const payment = order.payments.find((candidate) => candidate.id === paymentId);
      if (!payment) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
      if (payment.status !== 'SUCCEEDED' || payment.purpose !== 'DEPOSIT')
        throw new AppError(
          409,
          'REFUND_NOT_ALLOWED',
          'Only successful deposit payments can be refunded',
        );
      if (!refundableOrderStatuses.includes(order.status))
        throw new AppError(
          409,
          'REFUND_NOT_ALLOWED',
          'The rental order is not eligible for a refund',
        );
      const orderSettlement = settlement(order);
      const sourceRefunded = payment.refunds
        .filter((refund) => ['REQUESTED', 'PROCESSING', 'COMPLETED'].includes(refund.status))
        .reduce((sum, refund) => sum + refund.amountVnd, 0n);
      const sourceAvailable = payment.amountVnd - sourceRefunded;
      if (
        input.amountVnd > sourceAvailable ||
        input.amountVnd > orderSettlement.deposit.refundAvailableVnd
      )
        throw new AppError(
          409,
          'REFUND_AMOUNT_EXCEEDS_BALANCE',
          'Refund exceeds the available refundable balance',
        );
      return tx.refund.create({
        data: {
          paymentId,
          amountVnd: input.amountVnd,
          reason: input.reason,
          idempotencyKey: input.idempotencyKey,
          requestedBy: actor.id,
        },
      });
    }, transactionOptions);
  } catch (error) {
    if (!isUnique(error)) throw error;
    const refund = await prisma.refund.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (!refund) throw error;
    assertSameRefundRequest(refund, paymentId, input);
    return refund;
  }
}

export async function completeRefund(
  actor: AuthenticatedActor,
  refundId: string,
  input: CompleteRefundInput,
) {
  return prisma.$transaction(async (tx) => {
    const target = await tx.refund.findUnique({
      where: { id: refundId },
      select: { payment: { select: { orderId: true } } },
    });
    if (!target) throw new AppError(404, 'REFUND_NOT_FOUND', 'Refund not found');
    const order = await lockOrder(tx, target.payment.orderId);
    assertRefundApproval(actor, order.pickupBranchId);
    const refund = await lockRefund(tx, refundId);
    if (!['REQUESTED', 'PROCESSING'].includes(refund.status))
      throw new AppError(
        409,
        'INVALID_REFUND_TRANSITION',
        'Refund cannot be completed from its current status',
      );
    const duplicate = await tx.refund.findFirst({
      where: { providerRefundId: input.transactionReference, id: { not: refund.id } },
      select: { id: true },
    });
    if (duplicate)
      throw new AppError(
        409,
        'REFUND_REFERENCE_CONFLICT',
        'Refund transaction reference already exists',
      );
    const summary = settlement(order);
    const availableAfterReleasingCurrentRequest =
      summary.deposit.refundAvailableVnd + refund.amountVnd;
    if (refund.amountVnd > availableAfterReleasingCurrentRequest)
      throw new AppError(
        409,
        'REFUND_AMOUNT_EXCEEDS_BALANCE',
        'Refund exceeds the available refundable balance',
      );
    return tx.refund.update({
      where: { id: refund.id },
      data: {
        status: 'COMPLETED',
        approvedBy: actor.id,
        providerRefundId: input.transactionReference,
        completedAt: new Date(),
        failureReason: null,
      },
    });
  }, transactionOptions);
}

export async function failRefund(
  actor: AuthenticatedActor,
  refundId: string,
  input: FailRefundInput,
) {
  return prisma.$transaction(async (tx) => {
    const target = await tx.refund.findUnique({
      where: { id: refundId },
      select: { payment: { select: { orderId: true } } },
    });
    if (!target) throw new AppError(404, 'REFUND_NOT_FOUND', 'Refund not found');
    const order = await lockOrder(tx, target.payment.orderId);
    assertRefundApproval(actor, order.pickupBranchId);
    const refund = await lockRefund(tx, refundId);
    if (!['REQUESTED', 'PROCESSING'].includes(refund.status))
      throw new AppError(
        409,
        'INVALID_REFUND_TRANSITION',
        'Refund cannot fail from its current status',
      );
    return tx.refund.update({
      where: { id: refund.id },
      data: { status: 'FAILED', approvedBy: actor.id, failureReason: input.reason },
    });
  }, transactionOptions);
}
