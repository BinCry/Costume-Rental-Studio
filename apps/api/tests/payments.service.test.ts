/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  paymentFindUnique: vi.fn(),
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
