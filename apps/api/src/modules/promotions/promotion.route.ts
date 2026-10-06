/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Router } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { sendSuccess } from '../../common/http/response.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { promotionIdSchema, promotionListSchema, promotionSchema } from './promotion.schema.js';
import * as service from './promotion.service.js';

export const promotionRouter = Router();
promotionRouter.use(requireAuthentication);
const parse = <T>(result: { success: boolean; data?: T }, message: string) => {
  if (!result.success) throw new AppError(400, 'VALIDATION_ERROR', message);
  return result.data as T;
};
promotionRouter.get('/', async (q, r) =>
  sendSuccess(
    r,
    await service.listPromotions(
      r.locals.actor,
      parse(promotionListSchema.safeParse(q.query), 'Invalid promotion query'),
    ),
    'Promotions loaded',
  ),
);
promotionRouter.post('/', async (q, r) =>
  sendSuccess(
    r,
    await service.createPromotion(
      r.locals.actor,
      parse(promotionSchema.safeParse(q.body), 'Invalid promotion'),
    ),
    'Promotion created',
    201,
  ),
);
promotionRouter.patch('/:id', async (q, r) =>
  sendSuccess(
    r,
    await service.updatePromotion(
      r.locals.actor,
      parse(promotionIdSchema.safeParse(q.params), 'Invalid promotion id').id,
      parse(promotionSchema.partial().safeParse(q.body), 'Invalid promotion'),
    ),
    'Promotion updated',
  ),
);
promotionRouter.post('/:id/:action', async (q, r) => {
  const id = parse(promotionIdSchema.safeParse(q.params), 'Invalid promotion id').id;
  if (!['activate', 'deactivate'].includes(q.params.action))
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid promotion action');
  return sendSuccess(
    r,
    await service.setPromotionStatus(r.locals.actor, id, q.params.action === 'activate'),
    'Promotion status updated',
  );
});
