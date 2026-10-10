import { PayOS, type PaymentLinkStatus, type Webhook, type WebhookData } from '@payos/node';

import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';

export interface PayosCheckout {
  paymentLinkId: string;
  checkoutUrl: string;
  qrCode: string | null;
  expiredAt: Date | null;
  orderCode: number;
  amountVnd: number;
  status: PaymentLinkStatus;
}

export async function getPayosCheckout(orderCode: number): Promise<PayosCheckout> {
  const response = await client().paymentRequests.get(orderCode);
  return {
    paymentLinkId: response.id,
    checkoutUrl: `${env.PAYOS_CHECKOUT_BASE_URL.replace(/\/+$/, '')}/${response.id}`,
    qrCode: null,
    expiredAt: null,
    orderCode: response.orderCode,
    amountVnd: response.amount,
    status: response.status,
  };
}

function client() {
  if (
    !env.PAYOS_CLIENT_ID ||
    !env.PAYOS_API_KEY ||
    !env.PAYOS_CHECKSUM_KEY ||
    !env.PAYOS_RETURN_URL ||
    !env.PAYOS_CANCEL_URL
  )
    throw new AppError(503, 'PAYMENT_GATEWAY_UNAVAILABLE', 'payOS is not configured');

  return new PayOS({
    clientId: env.PAYOS_CLIENT_ID,
    apiKey: env.PAYOS_API_KEY,
    checksumKey: env.PAYOS_CHECKSUM_KEY,
  });
}

export async function createPayosCheckout(input: {
  orderCode: number;
  amountVnd: number;
  description: string;
}): Promise<PayosCheckout> {
  const response = await client().paymentRequests.create({
    orderCode: input.orderCode,
    amount: input.amountVnd,
    description: input.description,
    returnUrl: env.PAYOS_RETURN_URL!,
    cancelUrl: env.PAYOS_CANCEL_URL!,
  });
  return {
    paymentLinkId: response.paymentLinkId,
    checkoutUrl: response.checkoutUrl,
    qrCode: response.qrCode,
    expiredAt: response.expiredAt ? new Date(response.expiredAt * 1_000) : null,
    orderCode: response.orderCode,
    amountVnd: response.amount,
    status: response.status,
  };
}

export async function cancelPayosCheckout(paymentLinkId: string, reason: string) {
  const response = await client().paymentRequests.cancel(paymentLinkId, reason);
  return {
    paymentLinkId: response.id,
    orderCode: response.orderCode,
    amountVnd: response.amount,
    status: response.status,
  };
}

export async function verifyPayosWebhook(payload: unknown): Promise<WebhookData> {
  if (typeof payload !== 'object' || payload === null)
    throw new AppError(400, 'INVALID_WEBHOOK', 'Invalid payOS webhook payload');
  const payos = client();
  try {
    return await payos.webhooks.verify(payload as Webhook);
  } catch {
    throw new AppError(400, 'INVALID_WEBHOOK_SIGNATURE', 'Invalid payOS webhook signature');
  }
}
