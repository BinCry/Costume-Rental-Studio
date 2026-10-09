/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Router } from 'express';

import { AppError } from '../../common/errors/app-error.js';
import { sendSuccess } from '../../common/http/response.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import {
  approveTransferSchema,
  createTransferSchema,
  endTransferSchema,
  listTransfersSchema,
  receiveTransferSchema,
  shipTransferSchema,
  transferIdSchema,
  updateTransferSchema,
} from './transfer.schema.js';
import * as service from './transfer.service.js';

export const transferRouter = Router();
transferRouter.use(requireAuthentication);

function parse<T>(result: { success: boolean; data?: T }, message: string): T {
  if (!result.success) throw new AppError(400, 'VALIDATION_ERROR', message);
  return result.data as T;
}
function transferId(params: unknown) {
  return parse(transferIdSchema.safeParse(params), 'Invalid transfer id').transferId;
}

transferRouter.get('/transfers', async (req, res) =>
  sendSuccess(
    res,
    await service.listTransfers(
      res.locals.actor,
      parse(listTransfersSchema.safeParse(req.query), 'Invalid transfer query'),
    ),
    'Transfers loaded',
  ),
);
transferRouter.post('/transfers', async (req, res) =>
  sendSuccess(
    res,
    await service.createTransfer(
      res.locals.actor,
      parse(createTransferSchema.safeParse(req.body), 'Invalid transfer'),
    ),
    'Transfer requested',
    201,
  ),
);
transferRouter.get('/transfers/:transferId', async (req, res) =>
  sendSuccess(
    res,
    await service.getTransfer(res.locals.actor, transferId(req.params)),
    'Transfer loaded',
  ),
);
transferRouter.patch('/transfers/:transferId', async (req, res) =>
  sendSuccess(
    res,
    await service.updateTransfer(
      res.locals.actor,
      transferId(req.params),
      parse(updateTransferSchema.safeParse(req.body), 'Invalid transfer update'),
    ),
    'Transfer updated',
  ),
);
transferRouter.post('/transfers/:transferId/approve', async (req, res) =>
  sendSuccess(
    res,
    await service.approveTransfer(
      res.locals.actor,
      transferId(req.params),
      parse(approveTransferSchema.safeParse(req.body), 'Invalid transfer approval'),
    ),
    'Transfer approved',
  ),
);
transferRouter.post('/transfers/:transferId/reject', async (req, res) =>
  sendSuccess(
    res,
    await service.endTransfer(
      res.locals.actor,
      transferId(req.params),
      'REJECTED',
      parse(endTransferSchema.safeParse(req.body), 'Invalid transfer rejection'),
    ),
    'Transfer rejected',
  ),
);
transferRouter.post('/transfers/:transferId/cancel', async (req, res) =>
  sendSuccess(
    res,
    await service.endTransfer(
      res.locals.actor,
      transferId(req.params),
      'CANCELLED',
      parse(endTransferSchema.safeParse(req.body), 'Invalid transfer cancellation'),
    ),
    'Transfer cancelled',
  ),
);
transferRouter.post('/transfers/:transferId/ship', async (req, res) =>
  sendSuccess(
    res,
    await service.shipTransfer(
      res.locals.actor,
      transferId(req.params),
      parse(shipTransferSchema.safeParse(req.body), 'Invalid shipment'),
    ),
    'Transfer shipped',
  ),
);
transferRouter.post('/transfers/:transferId/receive', async (req, res) =>
  sendSuccess(
    res,
    await service.receiveTransfer(
      res.locals.actor,
      transferId(req.params),
      parse(receiveTransferSchema.safeParse(req.body), 'Invalid receipt'),
    ),
    'Transfer received',
  ),
);
