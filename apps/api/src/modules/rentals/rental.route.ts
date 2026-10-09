/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Router } from 'express';

import { AppError } from '../../common/errors/app-error.js';
import { sendSuccess } from '../../common/http/response.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import {
  availabilitySchema,
  completeSchema,
  confirmSchema,
  createOrderSchema,
  eventListSchema,
  listOrdersSchema,
  orderIdSchema,
  pickupSchema,
  reasonSchema,
  reallocateSchema,
  returnSchema,
  updateOrderSchema,
  versionSchema,
} from './rental.schema.js';
import * as service from './rental.service.js';

export const rentalRouter = Router();
rentalRouter.use(requireAuthentication);
function parse<T>(result: { success: boolean; data?: T }, message: string): T {
  if (!result.success) throw new AppError(400, 'VALIDATION_ERROR', message);
  return result.data as T;
}
function orderId(params: unknown) {
  return parse(orderIdSchema.safeParse(params), 'Invalid rental order id').orderId;
}

rentalRouter.get('/availability', async (req, res) =>
  sendSuccess(
    res,
    await service.checkAvailability(
      res.locals.actor,
      parse(availabilitySchema.safeParse(req.query), 'Invalid availability query'),
    ),
    'Availability loaded',
  ),
);
rentalRouter.get('/orders', async (req, res) =>
  sendSuccess(
    res,
    await service.listOrders(
      res.locals.actor,
      parse(listOrdersSchema.safeParse(req.query), 'Invalid rental order query'),
    ),
    'Rental orders loaded',
  ),
);
rentalRouter.post('/orders', async (req, res) =>
  sendSuccess(
    res,
    await service.createOrder(
      res.locals.actor,
      parse(createOrderSchema.safeParse(req.body), 'Invalid rental order'),
    ),
    'Rental order created',
    201,
  ),
);
rentalRouter.get('/orders/:orderId', async (req, res) =>
  sendSuccess(
    res,
    await service.getOrder(res.locals.actor, orderId(req.params)),
    'Rental order loaded',
  ),
);
rentalRouter.patch('/orders/:orderId', async (req, res) =>
  sendSuccess(
    res,
    await service.updateOrder(
      res.locals.actor,
      orderId(req.params),
      parse(updateOrderSchema.safeParse(req.body), 'Invalid rental order update'),
    ),
    'Rental order updated',
  ),
);
rentalRouter.post('/orders/:orderId/confirm', async (req, res) =>
  sendSuccess(
    res,
    await service.confirmOrder(
      res.locals.actor,
      orderId(req.params),
      parse(confirmSchema.safeParse(req.body), 'Invalid order confirmation'),
    ),
    'Rental order confirmed',
  ),
);
rentalRouter.post('/orders/:orderId/reject', async (req, res) => {
  const input = parse(reasonSchema.safeParse(req.body), 'Invalid rejection');
  return sendSuccess(
    res,
    await service.rejectOrder(
      res.locals.actor,
      orderId(req.params),
      input.expectedVersion,
      input.reason,
    ),
    'Rental order rejected',
  );
});
rentalRouter.post('/orders/:orderId/reallocate', async (req, res) =>
  sendSuccess(
    res,
    await service.reallocateOrder(
      res.locals.actor,
      orderId(req.params),
      parse(reallocateSchema.safeParse(req.body), 'Invalid reallocation'),
    ),
    'Rental unit reallocated',
  ),
);
rentalRouter.post('/orders/:orderId/prepare', async (req, res) => {
  const input = parse(versionSchema.safeParse(req.body), 'Invalid preparation');
  return sendSuccess(
    res,
    await service.prepareOrder(res.locals.actor, orderId(req.params), input.expectedVersion),
    'Rental order preparation started',
  );
});
rentalRouter.post('/orders/:orderId/ready', async (req, res) => {
  const input = parse(versionSchema.safeParse(req.body), 'Invalid ready action');
  return sendSuccess(
    res,
    await service.markOrderReady(res.locals.actor, orderId(req.params), input.expectedVersion),
    'Rental order ready for pickup',
  );
});
rentalRouter.post('/orders/:orderId/pickup', async (req, res) =>
  sendSuccess(
    res,
    await service.pickupOrder(
      res.locals.actor,
      orderId(req.params),
      parse(pickupSchema.safeParse(req.body), 'Invalid pickup'),
    ),
    'Rental order picked up',
  ),
);
rentalRouter.post('/orders/:orderId/return', async (req, res) =>
  sendSuccess(
    res,
    await service.returnOrder(
      res.locals.actor,
      orderId(req.params),
      parse(returnSchema.safeParse(req.body), 'Invalid return'),
    ),
    'Rental order returned',
  ),
);
rentalRouter.post('/orders/:orderId/complete', async (req, res) =>
  sendSuccess(
    res,
    await service.completeOrder(
      res.locals.actor,
      orderId(req.params),
      parse(completeSchema.safeParse(req.body), 'Invalid settlement'),
    ),
    'Rental order completed',
  ),
);
rentalRouter.post('/orders/:orderId/cancel', async (req, res) => {
  const input = parse(reasonSchema.safeParse(req.body), 'Invalid cancellation');
  return sendSuccess(
    res,
    await service.cancelOrder(
      res.locals.actor,
      orderId(req.params),
      input.expectedVersion,
      input.reason,
    ),
    'Rental order cancelled',
  );
});
rentalRouter.post('/orders/:orderId/no-show', async (req, res) => {
  const input = parse(reasonSchema.safeParse(req.body), 'Invalid no-show');
  return sendSuccess(
    res,
    await service.markNoShow(
      res.locals.actor,
      orderId(req.params),
      input.expectedVersion,
      input.reason,
    ),
    'Rental order marked no-show',
  );
});
rentalRouter.get('/orders/:orderId/events', async (req, res) =>
  sendSuccess(
    res,
    await service.listOrderEvents(
      res.locals.actor,
      orderId(req.params),
      parse(eventListSchema.safeParse(req.query), 'Invalid event query'),
    ),
    'Rental order events loaded',
  ),
);
