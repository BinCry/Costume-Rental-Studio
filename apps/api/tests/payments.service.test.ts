/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  paymentFindUnique: vi.fn(),
  rentalOrderFindUnique: vi.fn(),
  paymentFindFirst: vi.fn(),
  paymentUpdate: vi.fn(),
  eventFindFirst: vi.fn(),
  transaction: vi.fn(),
  verifyWebhook: vi.fn(),
  createCheckout: vi.fn(),
  getCheckout: vi.fn(),
  cancelCheckout: vi.fn(),
}));

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    rentalOrder: { findUnique: mocks.rentalOrderFindUnique },
    payment: {
      findUnique: mocks.paymentFindUnique,
      findFirst: mocks.paymentFindFirst,
      update: mocks.paymentUpdate,
    },
    providerWebhookEvent: { findFirst: mocks.eventFindFirst, create: vi.fn() },
    $transaction: mocks.transaction,
  },
}));

vi.mock('../src/modules/payments/payos.gateway.js', () => ({
  createPayosCheckout: mocks.createCheckout,
  getPayosCheckout: mocks.getCheckout,
  cancelPayosCheckout: mocks.cancelCheckout,
  verifyPayosWebhook: mocks.verifyWebhook,
}));

const service = await import('../src/modules/payments/payment.service.js');

const customerId = '10000000-0000-4000-8000-000000000001';
const orderId = '10000000-0000-4000-8000-000000000002';
const paymentId = '10000000-0000-4000-8000-000000000003';

const customerActor = {
  id: customerId,
  status: 'ACTIVE',
  employee: null,
  roleAssignments: [
    {
      branchId: null,
      branch: null,
      role: {
        roleCode: 'CUSTOMER',
        name: 'Customer',
        actorGroup: 'CUSTOMER',
        isActive: true,
        rolePermissions: [
          {
            permission: {
              code: 'rentals.read.own',
              module: 'rentals',
              action: 'read',
              scope: 'OWN',
            },
          },
          {
            permission: {
              code: 'rentals.manage.own',
              module: 'rentals',
              action: 'manage',
              scope: 'OWN',
            },
          },
        ],
      },
    },
  ],
} as never;

function gatewayPayment(customerUserId = customerId) {
  return {
    id: paymentId,
    orderId,
    purpose: 'DEPOSIT',
    method: 'PAYMENT_GATEWAY',
    amountVnd: 1_000n,
    status: 'PENDING',
    provider: 'PAYOS',
    providerPaymentId: 'link-1',
    providerOrderCode: 1_000_000_001n,
    providerStatus: 'PENDING',
    checkoutUrl: 'https://pay.payos.vn/web/link-1',
    qrCode: 'vietqr-data',
    expiresAt: null,
    idempotencyKey: 'checkout-1',
    recordedBy: null,
    paidAt: null,
    failureReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    refunds: [],
    order: { id: orderId, pickupBranchId: 'branch-1', customerUserId },
  };
}

function verifiedWebhook() {
  return {
    orderCode: 1_000_000_001,
    amount: 1_000,
    description: 'CRS 1000000001',
    accountNumber: '123',
    reference: 'transaction-1',
    transactionDateTime: '2026-10-10 09:00:00',
    currency: 'VND',
    paymentLinkId: 'link-1',
    code: '00',
    desc: 'success',
  };
}

beforeEach(() => vi.resetAllMocks());

describe('payment service settlement snapshot', () => {
  it('returns the outstanding rental and extra balance', async () => {
    mocks.rentalOrderFindUnique.mockResolvedValue({
      id: orderId,
      status: 'RETURN_INSPECTION',
      customerUserId: customerId,
      pickupBranchId: 'branch-1',
      items: [
        {
          billableDays: 1,
          unitDailyPriceVnd: 1_500n,
          unitDepositVnd: 500n,
          damageFeeVnd: 0n,
          missingFeeVnd: 0n,
          accessories: [],
        },
      ],
      promotionDiscountVnd: 0n,
      additionalRentalFeeVnd: 0n,
      lateFeeVnd: 250n,
      otherFeeVnd: 0n,
      depositDeductionVnd: 0n,
      payments: [
        { purpose: 'RENTAL', amountVnd: 1_500n, status: 'SUCCEEDED', refunds: [] },
        { purpose: 'DEPOSIT', amountVnd: 500n, status: 'SUCCEEDED', refunds: [] },
      ],
    });

    await expect(service.getSettlement(customerActor, orderId)).resolves.toMatchObject({
      extra: { remainingVnd: 250n },
      outstandingVnd: 250n,
    });
  });

  it('clamps the extra balance to zero when the deposit deduction exceeds extra fees', async () => {
    mocks.rentalOrderFindUnique.mockResolvedValue({
      id: orderId,
      status: 'RETURN_INSPECTION',
      customerUserId: customerId,
      pickupBranchId: 'branch-1',
      items: [
        {
          billableDays: 1,
          unitDailyPriceVnd: 0n,
          unitDepositVnd: 200_000n,
          damageFeeVnd: 0n,
          missingFeeVnd: 0n,
          accessories: [],
        },
      ],
      promotionDiscountVnd: 0n,
      additionalRentalFeeVnd: 0n,
      lateFeeVnd: 0n,
      otherFeeVnd: 100_000n,
      depositDeductionVnd: 200_000n,
      payments: [
        { purpose: 'RENTAL', amountVnd: 0n, status: 'SUCCEEDED', refunds: [] },
        { purpose: 'DEPOSIT', amountVnd: 200_000n, status: 'SUCCEEDED', refunds: [] },
      ],
    });

    await expect(service.getSettlement(customerActor, orderId)).resolves.toMatchObject({
      extra: { dueVnd: 100_000n, paidVnd: 0n, remainingVnd: 0n },
      outstandingVnd: 0n,
      canComplete: true,
    });
  });
});

const staffActor = {
  id: '10000000-0000-4000-8000-000000000004',
  status: 'ACTIVE',
  employee: { employmentStatus: 'ACTIVE' },
  roleAssignments: [
    {
      branchId: 'branch-1',
      branch: { status: 'ACTIVE' },
      role: {
        isActive: true,
        rolePermissions: [
          { permission: { module: 'payments', action: 'collect', scope: 'BRANCH' } },
          { permission: { module: 'payments', action: 'read', scope: 'BRANCH' } },
        ],
      },
    },
  ],
} as never;

describe('payment service EXTRA collection balance', () => {
  it('caps collection after deposit deduction and keeps exact idempotent retries safe', async () => {
    const order = {
      id: orderId,
      status: 'RETURN_INSPECTION',
      inspectionStatus: 'HAS_DAMAGE',
      customerUserId: customerId,
      pickupBranchId: 'branch-1',
      items: [
        {
          billableDays: 1,
          unitDailyPriceVnd: 0n,
          unitDepositVnd: 500_000n,
          damageFeeVnd: 0n,
          missingFeeVnd: 0n,
          accessories: [],
        },
      ],
      promotionDiscountVnd: 0n,
      additionalRentalFeeVnd: 0n,
      lateFeeVnd: 0n,
      otherFeeVnd: 500_000n,
      depositDeductionVnd: 200_000n,
      payments: [{ purpose: 'DEPOSIT', amountVnd: 500_000n, status: 'SUCCEEDED' }],
    };
    const extraPayment = {
      id: paymentId,
      orderId,
      purpose: 'EXTRA',
      method: 'CASH',
      amountVnd: 300_000n,
      status: 'SUCCEEDED',
      idempotencyKey: 'extra-300k',
      order: { id: orderId, pickupBranchId: 'branch-1', customerUserId: customerId },
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: orderId }]),
      rentalOrder: { findUniqueOrThrow: vi.fn().mockResolvedValue(order) },
      payment: { create: vi.fn().mockResolvedValue(extraPayment) },
    };
    mocks.paymentFindUnique.mockResolvedValue(null);
    mocks.transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    );

    await expect(
      service.createCashPayment(staffActor, orderId, {
        purpose: 'EXTRA',
        amountVnd: 300_001n,
        idempotencyKey: 'extra-over-limit',
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'PAYMENT_AMOUNT_EXCEEDS_BALANCE',
    });
    expect(tx.payment.create).not.toHaveBeenCalled();

    await expect(
      service.createCashPayment(staffActor, orderId, {
        purpose: 'EXTRA',
        amountVnd: 300_000n,
        idempotencyKey: 'extra-300k',
      }),
    ).resolves.toMatchObject({ id: paymentId, amountVnd: 300_000n });
    expect(tx.payment.create).toHaveBeenCalledOnce();

    order.payments.push(extraPayment);
    mocks.paymentFindUnique.mockResolvedValue(extraPayment);
    await expect(
      service.createCashPayment(staffActor, orderId, {
        purpose: 'EXTRA',
        amountVnd: 300_000n,
        idempotencyKey: 'extra-300k',
      }),
    ).resolves.toMatchObject({ id: paymentId, amountVnd: 300_000n });
    expect(tx.payment.create).toHaveBeenCalledOnce();

    mocks.paymentFindUnique.mockResolvedValue(null);
    await expect(
      service.createCashPayment(staffActor, orderId, {
        purpose: 'EXTRA',
        amountVnd: 1n,
        idempotencyKey: 'extra-after-balance',
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'PAYMENT_AMOUNT_EXCEEDS_BALANCE',
    });
    expect(tx.payment.create).toHaveBeenCalledOnce();

    order.inspectionStatus = 'PENDING_ASSESSMENT';
    await expect(
      service.createCashPayment(staffActor, orderId, {
        purpose: 'EXTRA',
        amountVnd: 1n,
        idempotencyKey: 'extra-before-assessment',
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'PAYMENT_NOT_ALLOWED',
    });
    expect(tx.payment.create).toHaveBeenCalledOnce();
  });
});

const managerActor = {
  id: '10000000-0000-4000-8000-000000000005',
  status: 'ACTIVE',
  employee: { employmentStatus: 'ACTIVE' },
  roleAssignments: [
    {
      branchId: 'branch-1',
      branch: { status: 'ACTIVE' },
      role: {
        isActive: true,
        rolePermissions: [
          { permission: { module: 'payments', action: 'manage', scope: 'BRANCH' } },
        ],
      },
    },
  ],
} as never;

describe('payment service settlement locking', () => {
  const returnedAt = new Date('2026-10-15T10:00:00.000Z');

  function createOrder(extraCreatedAt: Date) {
    return {
      id: orderId,
      status: 'RETURN_INSPECTION',
      inspectionStatus: 'HAS_DAMAGE',
      returnedAt,
      version: 3,
      customerUserId: customerId,
      pickupBranchId: 'branch-1',
      items: [{
        billableDays: 1,
        unitDailyPriceVnd: 0n,
        unitDepositVnd: 200_000n,
        damageFeeVnd: 100_000n,
        missingFeeVnd: 0n,
        accessories: [],
      }],
      promotionDiscountVnd: 0n,
      additionalRentalFeeVnd: 50_000n,
      lateFeeVnd: 0n,
      otherFeeVnd: 0n,
      depositDeductionVnd: 0n,
      settlementNote: null,
      payments: [
        {
          purpose: 'EXTRA',
          amountVnd: 50_000n,
          status: 'SUCCEEDED',
          createdAt: extraCreatedAt,
          refunds: [],
        },
        {
          purpose: 'DEPOSIT',
          amountVnd: 200_000n,
          status: 'SUCCEEDED',
          createdAt: new Date('2026-10-15T08:00:00.000Z'),
          refunds: [{ status: 'FAILED', amountVnd: 10_000n }],
        },
      ],
    };
  }

  it('allows changing settlement after a pre-return extension charge and failed refund', async () => {
    const order = createOrder(new Date('2026-10-15T09:00:00.000Z'));
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: orderId }]),
      rentalOrder: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(order),
        update: vi.fn().mockResolvedValue({ ...order, otherFeeVnd: 100_000n, version: 4 }),
      },
    };
    mocks.transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    );

    await expect(
      service.prepareSettlement(managerActor, orderId, {
        expectedVersion: 3,
        otherFeeVnd: 100_000n,
        depositDeductionVnd: 0n,
        settlementNote: 'Đã kiểm tra tại quầy',
      }),
    ).resolves.toMatchObject({ version: 4, otherFeeVnd: 100_000n });
    expect(tx.rentalOrder.update).toHaveBeenCalledOnce();
  });

  it('locks settlement changes after an EXTRA payment collected after return', async () => {
    const order = createOrder(new Date('2026-10-15T11:00:00.000Z'));
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: orderId }]),
      rentalOrder: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(order),
        update: vi.fn(),
      },
    };
    mocks.transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    );

    await expect(
      service.prepareSettlement(managerActor, orderId, {
        expectedVersion: 3,
        otherFeeVnd: 100_000n,
        depositDeductionVnd: 0n,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'SETTLEMENT_LOCKED',
    });
    expect(tx.rentalOrder.update).not.toHaveBeenCalled();
  });
});

describe('payment service payOS flow', () => {
  it('allows an own-order customer to replay checkout, but rejects another customer order', async () => {
    mocks.paymentFindUnique.mockResolvedValue(gatewayPayment());
    await expect(
      service.createCheckout(customerActor, orderId, {
        purpose: 'DEPOSIT',
        amountVnd: 1_000n,
        idempotencyKey: 'checkout-1',
      }),
    ).resolves.toMatchObject({ checkoutUrl: 'https://pay.payos.vn/web/link-1' });

    mocks.paymentFindUnique.mockResolvedValue(gatewayPayment('another-customer'));
    await expect(
      service.createCheckout(customerActor, orderId, {
        purpose: 'DEPOSIT',
        amountVnd: 1_000n,
        idempotencyKey: 'checkout-1',
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('recovers an ambiguous same-key checkout by matching provider order code and amount', async () => {
    const initializing = {
      ...gatewayPayment(),
      providerPaymentId: null,
      providerStatus: 'INITIALIZING',
      checkoutUrl: null,
      qrCode: null,
    };
    const recovered = {
      ...initializing,
      providerPaymentId: 'link-recovered',
      checkoutUrl: 'https://pay.payos.vn/web/link-recovered',
    };
    mocks.paymentFindUnique.mockResolvedValue(initializing);
    mocks.createCheckout.mockRejectedValue(new Error('ambiguous timeout'));
    mocks.getCheckout.mockResolvedValue({
      paymentLinkId: 'link-recovered',
      checkoutUrl: 'https://pay.payos.vn/web/link-recovered',
      qrCode: null,
      expiredAt: null,
      orderCode: 1_000_000_001,
      amountVnd: 1_000,
      status: 'PENDING',
    });
    mocks.paymentUpdate.mockResolvedValue(recovered);

    await expect(
      service.createCheckout(customerActor, orderId, {
        purpose: 'DEPOSIT',
        amountVnd: 1_000n,
        idempotencyKey: 'checkout-1',
      }),
    ).resolves.toMatchObject({ checkoutUrl: 'https://pay.payos.vn/web/link-recovered' });
    expect(mocks.getCheckout).toHaveBeenCalledWith(1_000_000_001);
    expect(mocks.paymentUpdate).toHaveBeenCalledOnce();
  });

  it('keeps a recovered provider-paid link in reconciliation on every replay', async () => {
    const reconciling = {
      ...gatewayPayment(),
      providerStatus: 'PAID',
      qrCode: null,
    };
    mocks.paymentFindUnique.mockResolvedValue(reconciling);
    mocks.getCheckout.mockResolvedValue({
      paymentLinkId: 'link-1',
      checkoutUrl: 'https://pay.payos.vn/web/link-1',
      qrCode: null,
      expiredAt: null,
      orderCode: 1_000_000_001,
      amountVnd: 1_000,
      status: 'PAID',
    });
    mocks.paymentUpdate.mockResolvedValue(reconciling);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(
        service.createCheckout(customerActor, orderId, {
          purpose: 'DEPOSIT',
          amountVnd: 1_000n,
          idempotencyKey: 'checkout-1',
        }),
      ).rejects.toMatchObject({ statusCode: 409, code: 'PAYMENT_RECONCILIATION_REQUIRED' });
    }
    expect(mocks.getCheckout).toHaveBeenCalledTimes(2);
    expect(mocks.createCheckout).not.toHaveBeenCalled();
  });

  it('reconciles cancellation and never marks a provider-paid link cancelled', async () => {
    const payment = gatewayPayment();
    const order = { id: orderId, customerUserId: customerId, pickupBranchId: 'branch-1' };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: orderId }]),
      rentalOrder: { findUniqueOrThrow: vi.fn().mockResolvedValue(order) },
      payment: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(payment),
        update: vi.fn().mockResolvedValue({ ...payment, status: 'CANCELLED' }),
      },
    };
    mocks.paymentFindUnique.mockResolvedValue(payment);
    mocks.cancelCheckout.mockRejectedValue(new Error('ambiguous timeout'));
    mocks.getCheckout.mockResolvedValue({
      paymentLinkId: 'link-1',
      checkoutUrl: 'https://pay.payos.vn/web/link-1',
      qrCode: null,
      expiredAt: null,
      orderCode: 1_000_000_001,
      amountVnd: 1_000,
      status: 'CANCELLED',
    });
    mocks.transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    );

    await expect(
      service.cancelPayment(customerActor, paymentId, { reason: 'Customer cancelled' }),
    ).resolves.toMatchObject({ status: 'CANCELLED' });

    mocks.getCheckout.mockResolvedValue({
      paymentLinkId: 'link-1',
      checkoutUrl: 'https://pay.payos.vn/web/link-1',
      qrCode: null,
      expiredAt: null,
      orderCode: 1_000_000_001,
      amountVnd: 1_000,
      status: 'PAID',
    });
    await expect(
      service.cancelPayment(customerActor, paymentId, { reason: 'Customer cancelled' }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'PAYMENT_ALREADY_PAID' });
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });

  it('moves a matching pending payment to succeeded exactly once', async () => {
    const payment = gatewayPayment();
    const order = {
      id: orderId,
      status: 'CONFIRMED',
      pickupBranchId: 'branch-1',
      customerUserId: customerId,
      promotionDiscountVnd: 0n,
      lateFeeVnd: 0n,
      otherFeeVnd: 0n,
      depositDeductionVnd: 0n,
      items: [
        {
          billableDays: 1,
          unitDailyPriceVnd: 0n,
          unitDepositVnd: 1_000n,
          damageFeeVnd: 0n,
          missingFeeVnd: 0n,
          accessories: [],
        },
      ],
      payments: [payment],
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: orderId }]),
      rentalOrder: { findUniqueOrThrow: vi.fn().mockResolvedValue(order) },
      payment: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(payment),
        update: vi.fn().mockResolvedValue({ ...payment, status: 'SUCCEEDED' }),
      },
      providerWebhookEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    mocks.verifyWebhook.mockResolvedValue(verifiedWebhook());
    mocks.eventFindFirst.mockResolvedValue(null);
    mocks.paymentFindFirst.mockResolvedValue({ id: paymentId, orderId });
    mocks.transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    );

    await expect(service.handlePayosWebhook({ signature: 'valid' })).resolves.toEqual({
      processed: true,
      status: 'PROCESSED',
    });
    expect(tx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SUCCEEDED' }) }),
    );

    mocks.eventFindFirst.mockResolvedValue({ processingStatus: 'PROCESSED' });
    await expect(service.handlePayosWebhook({ signature: 'valid' })).resolves.toMatchObject({
      processed: false,
      reason: 'duplicate',
    });
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });

  it('sends a valid late payment on a terminal rental to review', async () => {
    const payment = gatewayPayment();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: orderId }]),
      rentalOrder: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: orderId,
          status: 'CANCELLED',
          pickupBranchId: 'branch-1',
          customerUserId: customerId,
          promotionDiscountVnd: 0n,
          lateFeeVnd: 0n,
          otherFeeVnd: 0n,
          depositDeductionVnd: 0n,
          items: [],
          payments: [payment],
        }),
      },
      payment: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(payment),
        update: vi.fn(),
      },
      providerWebhookEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    mocks.verifyWebhook.mockResolvedValue(verifiedWebhook());
    mocks.eventFindFirst.mockResolvedValue(null);
    mocks.paymentFindFirst.mockResolvedValue({ id: paymentId, orderId });
    mocks.transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    );

    await expect(service.handlePayosWebhook({ signature: 'valid' })).resolves.toEqual({
      processed: false,
      reason: 'terminal_order',
      status: 'REVIEW_REQUIRED',
    });
    expect(tx.payment.update).not.toHaveBeenCalled();
  });
});
