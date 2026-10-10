/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Router } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { sendSuccess } from '../../common/http/response.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import {
  blockIdSchema,
  cancelSchema,
  completionSchema,
  createUnitBlockSchema,
  listUnitBlocksSchema,
  updateUnitBlockSchema,
} from './scheduling.schema.js';
import * as service from './scheduling.service.js';

export const schedulingRouter = Router();
schedulingRouter.use(requireAuthentication);
function parse<T>(result: { success: boolean; data?: T }, message: string): T {
  if (!result.success) throw new AppError(400, 'VALIDATION_ERROR', message);
  return result.data as T;
}
function blockId(params: unknown) {
  return parse(blockIdSchema.safeParse(params), 'Invalid unit block id').blockId;
}
schedulingRouter.get('/unit-blocks', async (req, res) =>
  sendSuccess(
    res,
    await service.listUnitBlocks(
      res.locals.actor,
      parse(listUnitBlocksSchema.safeParse(req.query), 'Invalid block query'),
    ),
    'Unit blocks loaded',
  ),
);
schedulingRouter.get('/calendar', async (req, res) =>
  sendSuccess(
    res,
    await service.listUnitBlocks(
      res.locals.actor,
      parse(listUnitBlocksSchema.safeParse(req.query), 'Invalid calendar query'),
    ),
    'Scheduling calendar loaded',
  ),
);
schedulingRouter.post('/unit-blocks', async (req, res) =>
  sendSuccess(
    res,
    await service.createUnitBlock(
      res.locals.actor,
      parse(createUnitBlockSchema.safeParse(req.body), 'Invalid unit block'),
    ),
    'Unit block created',
    201,
  ),
);
schedulingRouter.patch('/unit-blocks/:blockId', async (req, res) =>
  sendSuccess(
    res,
    await service.updateUnitBlock(
      res.locals.actor,
      blockId(req.params),
      parse(updateUnitBlockSchema.safeParse(req.body), 'Invalid unit block update'),
    ),
    'Unit block updated',
  ),
);
schedulingRouter.post('/unit-blocks/:blockId/start', async (req, res) =>
  sendSuccess(
    res,
    await service.startUnitBlock(res.locals.actor, blockId(req.params)),
    'Unit block started',
  ),
);
schedulingRouter.post('/unit-blocks/:blockId/complete', async (req, res) =>
  sendSuccess(
    res,
    await service.completeUnitBlock(
      res.locals.actor,
      blockId(req.params),
      parse(completionSchema.safeParse(req.body), 'Invalid unit block completion'),
    ),
    'Unit block completed',
  ),
);
schedulingRouter.post('/unit-blocks/:blockId/cancel', async (req, res) =>
  sendSuccess(
    res,
    await service.cancelUnitBlock(
      res.locals.actor,
      blockId(req.params),
      parse(cancelSchema.safeParse(req.body), 'Invalid unit block cancellation').reason,
    ),
    'Unit block cancelled',
  ),
);
