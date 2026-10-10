import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.WEB_URL = 'http://localhost:3000';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/costume_rental_test';
process.env.PAYOS_CLIENT_ID = 'client-id';
process.env.PAYOS_API_KEY = 'api-key';
process.env.PAYOS_CHECKSUM_KEY = 'checksum-key';
process.env.PAYOS_ORDER_CODE_PREFIX = '101';
process.env.PAYOS_RETURN_URL = 'http://localhost:3000/payments/success';
process.env.PAYOS_CANCEL_URL = 'http://localhost:3000/payments/cancel';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  cancel: vi.fn(),
  verify: vi.fn(),
}));

vi.mock('@payos/node', () => ({
  PayOS: class {
    paymentRequests = { create: mocks.create, get: mocks.get, cancel: mocks.cancel };
    webhooks = { verify: mocks.verify };
  },
}));

const gateway = await import('../src/modules/payments/payos.gateway.js');

beforeEach(() => vi.resetAllMocks());

describe('payOS gateway', () => {
  it('creates a QR checkout using server-controlled callback URLs', async () => {
    mocks.create.mockResolvedValue({
      paymentLinkId: 'link-1',
      checkoutUrl: 'https://pay.payos.vn/web/link-1',
      qrCode: 'vietqr-data',
      expiredAt: 1_800_000_000,
      orderCode: 1_000_000_001,
      amount: 500_000,
      status: 'PENDING',
    });

    const result = await gateway.createPayosCheckout({
      orderCode: 1_000_000_001,
      amountVnd: 500_000,
      description: 'CRS 1000000001',
    });

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        orderCode: 1_000_000_001,
        amount: 500_000,
        returnUrl: process.env.PAYOS_RETURN_URL,
        cancelUrl: process.env.PAYOS_CANCEL_URL,
      }),
    );
    expect(result.paymentLinkId).toBe('link-1');
    expect(result.qrCode).toBe('vietqr-data');
  });

  it('delegates webhook signature verification to the official SDK', async () => {
    const verified = { orderCode: 1_000_000_001, reference: 'transaction-1' };
    const payload = { signature: 'signed', data: verified };
    mocks.verify.mockResolvedValue(verified);

    await expect(gateway.verifyPayosWebhook(payload)).resolves.toBe(verified);
    expect(mocks.verify).toHaveBeenCalledWith(payload);
  });

  it('reconciles an ambiguous checkout by its stable provider order code', async () => {
    mocks.get.mockResolvedValue({
      id: 'link-recovered',
      orderCode: 1_000_000_001,
      amount: 500_000,
      status: 'PENDING',
    });
    await expect(gateway.getPayosCheckout(1_000_000_001)).resolves.toMatchObject({
      paymentLinkId: 'link-recovered',
      checkoutUrl: 'https://pay.payos.vn/web/link-recovered',
      qrCode: null,
    });
    expect(mocks.get).toHaveBeenCalledWith(1_000_000_001);
  });

  it('rejects a webhook when signature verification fails', async () => {
    mocks.verify.mockRejectedValue(new Error('bad signature'));
    await expect(gateway.verifyPayosWebhook({ signature: 'bad' })).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_WEBHOOK_SIGNATURE',
    });
  });
});
