import { Router } from 'express';

import { AppError } from '../../common/errors/app-error.js';
import { sendSuccess } from '../../common/http/response.js';
import type { AuthenticatedActor } from '../auth/authorization.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import {
  adminReviewListSchema,
  modelIdSchema,
  moderateReviewSchema,
  reviewIdSchema,
  reviewListSchema,
  reviewOrderIdSchema,
  submitReviewSchema,
  updateReviewSchema,
} from './review.schema.js';
import * as service from './review.service.js';

export const reviewRouter = Router();

function parse<T>(result: { success: boolean; data?: T }, message: string): T {
  if (!result.success) throw new AppError(400, 'VALIDATION_ERROR', message);
  return result.data as T;
}

reviewRouter.get('/catalog/:modelId', async (request, response) =>
  sendSuccess(
    response,
    await service.listPublicModelReviews(
      parse(modelIdSchema.safeParse(request.params), 'Invalid model id').modelId,
      parse(reviewListSchema.safeParse(request.query), 'Invalid review filters'),
    ),
    'Reviews loaded',
  ),
);

reviewRouter.use(requireAuthentication);

reviewRouter.get('/orders/:orderId/eligibility', async (request, response) =>
  sendSuccess(
    response,
    await service.getOrderReviewEligibility(
      response.locals.actor as AuthenticatedActor,
      parse(reviewOrderIdSchema.safeParse(request.params), 'Invalid order id').orderId,
    ),
    'Review eligibility loaded',
  ),
);

reviewRouter.post('/orders/:orderId', async (request, response) =>
  sendSuccess(
    response,
    await service.createReview(
      response.locals.actor as AuthenticatedActor,
      parse(reviewOrderIdSchema.safeParse(request.params), 'Invalid order id').orderId,
      parse(submitReviewSchema.safeParse(request.body), 'Invalid review'),
    ),
    'Review submitted',
    201,
  ),
);

reviewRouter.patch('/:reviewId', async (request, response) =>
  sendSuccess(
    response,
    await service.updateReview(
      response.locals.actor as AuthenticatedActor,
      parse(reviewIdSchema.safeParse(request.params), 'Invalid review id').reviewId,
      parse(updateReviewSchema.safeParse(request.body), 'Invalid review update'),
    ),
    'Review updated',
  ),
);

reviewRouter.get('/admin', async (request, response) =>
  sendSuccess(
    response,
    await service.listAdminReviews(
      response.locals.actor as AuthenticatedActor,
      parse(adminReviewListSchema.safeParse(request.query), 'Invalid review filters'),
    ),
    'Admin reviews loaded',
  ),
);

reviewRouter.patch('/admin/:reviewId/moderation', async (request, response) =>
  sendSuccess(
    response,
    await service.moderateReview(
      response.locals.actor as AuthenticatedActor,
      parse(reviewIdSchema.safeParse(request.params), 'Invalid review id').reviewId,
      parse(moderateReviewSchema.safeParse(request.body), 'Invalid moderation update'),
    ),
    'Review moderation updated',
  ),
);
