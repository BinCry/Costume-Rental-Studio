/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Router } from 'express';

import { AppError } from '../../common/errors/app-error.js';
import { sendSuccess } from '../../common/http/response.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import {
  cancelPaymentSchema,
  completeRefundSchema,
  createCashPaymentSchema,
  createCheckoutSchema,
  createRefundSchema,
  failRefundSchema,
  orderIdSchema,
  paymentIdSchema,
  prepareSettlementSchema,
  refundIdSchema,
} from './payment.schema.js';
import * as service from './payment.service.js';

export const paymentRouter = Router();
export const paymentWebhookRouter = Router();
paymentRouter.use(requireAuthentication);

function parse<T>(result: { success: boolean; data?: T }, message: string): T {
  if (!result.success) throw new AppError(400, 'VALIDATION_ERROR', message);
  return result.data as T;
}
function orderId(params: unknown) {
  return parse(orderIdSchema.safeParse(params), 'Invalid rental order id').orderId;
}
function paymentId(params: unknown) {
  return parse(paymentIdSchema.safeParse(params), 'Invalid payment id').paymentId;
}
function refundId(params: unknown) {
  return parse(refundIdSchema.safeParse(params), 'Invalid refund id').refundId;
}

paymentRouter.get('/orders/:orderId/summary', async (req, res) =>
  sendSuccess(
    res,
    await service.getSettlement(res.locals.actor, orderId(req.params)),
    'Settlement loaded',
  ),
);
paymentRouter.get('/orders/:orderId', async (req, res) =>
  sendSuccess(
    res,
    await service.listPayments(res.locals.actor, orderId(req.params)),
    'Payments loaded',
  ),
);
paymentRouter.post('/orders/:orderId/cash', async (req, res) =>
  sendSuccess(
    res,
    await service.createCashPayment(
      res.locals.actor,
      orderId(req.params),
      parse(createCashPaymentSchema.safeParse(req.body), 'Invalid cash payment'),
    ),
    'Cash payment recorded',
    201,
  ),
);
paymentRouter.post('/orders/:orderId/checkout', async (req, res) =>
  sendSuccess(
    res,
    await service.createCheckout(
      res.locals.actor,
      orderId(req.params),
      parse(createCheckoutSchema.safeParse(req.body), 'Invalid checkout'),
    ),
    'Checkout created',
    201,
  ),
);
paymentRouter.post('/orders/:orderId/settlement', async (req, res) =>
  sendSuccess(
    res,
    await service.prepareSettlement(
      res.locals.actor,
      orderId(req.params),
      parse(prepareSettlementSchema.safeParse(req.body), 'Invalid settlement'),
    ),
    'Settlement prepared',
  ),
);
paymentRouter.get('/orders/:orderId/refunds', async (req, res) =>
  sendSuccess(
    res,
    await service.listRefunds(res.locals.actor, orderId(req.params)),
    'Refunds loaded',
  ),
);
paymentRouter.get('/:paymentId', async (req, res) =>
  sendSuccess(
    res,
    await service.getPayment(res.locals.actor, paymentId(req.params)),
    'Payment loaded',
  ),
);
paymentRouter.post('/:paymentId/cancel', async (req, res) =>
  sendSuccess(
    res,
    await service.cancelPayment(
      res.locals.actor,
      paymentId(req.params),
      parse(cancelPaymentSchema.safeParse(req.body), 'Invalid payment cancellation'),
    ),
    'Payment cancelled',
  ),
);
paymentRouter.post('/:paymentId/refunds', async (req, res) =>
  sendSuccess(
    res,
    await service.createRefund(
      res.locals.actor,
      paymentId(req.params),
      parse(createRefundSchema.safeParse(req.body), 'Invalid refund'),
    ),
    'Refund requested',
    201,
  ),
);
paymentRouter.post('/refunds/:refundId/complete', async (req, res) =>
  sendSuccess(
    res,
    await service.completeRefund(
      res.locals.actor,
      refundId(req.params),
      parse(completeRefundSchema.safeParse(req.body), 'Invalid refund completion'),
    ),
    'Refund completed',
  ),
);
paymentRouter.post('/refunds/:refundId/fail', async (req, res) =>
  sendSuccess(
    res,
    await service.failRefund(
      res.locals.actor,
      refundId(req.params),
      parse(failRefundSchema.safeParse(req.body), 'Invalid refund failure'),
    ),
    'Refund failed',
  ),
);

paymentWebhookRouter.post('/payos', async (req, res) =>
  sendSuccess(res, await service.handlePayosWebhook(req.body), 'Webhook processed'),
);
