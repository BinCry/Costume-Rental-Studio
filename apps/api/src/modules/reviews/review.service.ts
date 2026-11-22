import { randomUUID } from 'node:crypto';

import { AppError } from '../../common/errors/app-error.js';
import { pageResult, pagination } from '../../common/http/query.js';
import {
  deleteStoredObject,
  imageContentTypeForKey,
  promoteStoredImage,
  publicObjectUrl,
} from '../../common/storage/s3.js';
import { env } from '../../config/env.js';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  assertPermission,
  hasPermission,
  requireActor,
  type AuthenticatedActor,
} from '../auth/authorization.js';
import type {
  AdminReviewListInput,
  ReviewListInput,
  SubmitReviewInput,
  UpdateReviewInput,
} from './review.schema.js';

const editWindowMs = 30 * 24 * 60 * 60 * 1000;
const reviewInclude = {
  variant: {
    select: {
      id: true,
      variantCode: true,
      sizeCode: true,
      colorCode: true,
      model: { select: { id: true, name: true } },
    },
  },
  customer: { select: { user: { select: { displayName: true } } } },
  order: { select: { id: true, orderCode: true, returnedAt: true } },
  media: {
    orderBy: { sortOrder: 'asc' as const },
    select: { id: true, objectKey: true, contentType: true, sortOrder: true, createdAt: true },
  },
} satisfies Prisma.RentalReviewInclude;

function trimmedOrNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) return null;
  return trimmed;
}

function mediaView(
  media: {
    id: string;
    objectKey: string;
    contentType: string;
    sortOrder: number;
    createdAt: Date;
  }[],
) {
  return media.map(({ objectKey, ...item }) => ({ ...item, mediaUrl: publicObjectUrl(objectKey) }));
}

async function ownedReviewableOrder(actor: AuthenticatedActor, orderId: string) {
  requireActor(actor);
  const order = await prisma.rentalOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderCode: true,
      customerUserId: true,
      status: true,
      returnedAt: true,
      items: {
        orderBy: { createdAt: 'asc' },
        select: {
          variantId: true,
          variant: {
            select: {
              id: true,
              variantCode: true,
              sizeCode: true,
              colorCode: true,
              model: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });
  if (!order) throw new AppError(404, 'RENTAL_ORDER_NOT_FOUND', 'Rental order not found');
  if (
    actor.id !== order.customerUserId ||
    !hasPermission(actor, { module: 'rentals', action: 'manage', scope: 'OWN' })
  )
    throw new AppError(403, 'FORBIDDEN', 'Only the renter can review this order');
  if (!order.returnedAt || !['RETURN_INSPECTION', 'COMPLETED'].includes(order.status))
    throw new AppError(
      409,
      'REVIEW_NOT_AVAILABLE',
      'Reviews are available after the outfit is returned',
    );
  return order;
}

function assertUploadKeys(orderId: string, variantId: string, actorId: string, keys: string[]) {
  const prefix = `rental-review-staging/orders/${orderId}/variants/${variantId}/users/${actorId}/`;
  const uniqueKeys = [...new Set(keys)];
  if (
    uniqueKeys.length !== keys.length ||
    keys.some((key) => !key.startsWith(prefix) || !imageContentTypeForKey(key))
  )
    throw new AppError(400, 'INVALID_REVIEW_MEDIA', 'One or more review photos are invalid');
  return uniqueKeys;
}

async function promoteReviewUploads(input: {
  reviewId: string;
  modelId: string;
  variantId: string;
  uploadKeys: string[];
}) {
  const promoted: {
    uploadKey: string;
    objectKey: string;
    contentType: NonNullable<ReturnType<typeof imageContentTypeForKey>>;
  }[] = [];
  try {
    for (const uploadKey of input.uploadKeys) {
      const contentType = imageContentTypeForKey(uploadKey);
      if (!contentType)
        throw new AppError(400, 'INVALID_REVIEW_MEDIA', 'Review photo type is unsupported');
      const objectKey = `rental-reviews/${input.modelId}/${input.variantId}/${input.reviewId}/${randomUUID()}.${uploadKey.split('.').at(-1)}`;
      await promoteStoredImage({
        uploadKey,
        objectKey,
        contentType,
        maxBytes: env.MEDIA_MAX_UPLOAD_BYTES,
      });
      promoted.push({ uploadKey, objectKey, contentType });
    }
    return promoted;
  } catch (error) {
    await Promise.allSettled(promoted.map(({ objectKey }) => deleteStoredObject(objectKey)));
    throw error;
  }
}

export async function getOrderReviewEligibility(actor: AuthenticatedActor, orderId: string) {
  const order = await ownedReviewableOrder(actor, orderId);
  const variants = [...new Map(order.items.map((item) => [item.variantId, item.variant])).values()];
  const reviews = await prisma.rentalReview.findMany({
    where: { orderId, customerUserId: actor.id },
    include: reviewInclude,
  });
  const byVariant = new Map(reviews.map((review) => [review.variantId, review]));
  return {
    orderId: order.id,
    orderCode: order.orderCode,
    returnedAt: order.returnedAt,
    items: variants.map((variant) => {
      const review = byVariant.get(variant.id);
      return {
        variant,
        review: review
          ? {
              id: review.id,
              stars: review.stars,
              content: review.content,
              isAnonymous: review.isAnonymous,
              status: review.status,
              createdAt: review.createdAt,
              canEdit: Date.now() - review.createdAt.getTime() <= editWindowMs,
              media: mediaView(review.media),
            }
          : null,
      };
    }),
  };
}

export async function createReview(
  actor: AuthenticatedActor,
  orderId: string,
  input: SubmitReviewInput,
) {
  const order = await ownedReviewableOrder(actor, orderId);
  const variant = order.items.find((item) => item.variantId === input.variantId)?.variant;
  if (!variant)
    throw new AppError(
      400,
      'REVIEW_VARIANT_NOT_IN_ORDER',
      'This variant is not part of the rental order',
    );
  const uploadKeys = assertUploadKeys(order.id, variant.id, actor.id, input.uploadKeys);
  const reviewId = randomUUID();
  const promoted = await promoteReviewUploads({
    reviewId,
    modelId: variant.model.id,
    variantId: variant.id,
    uploadKeys,
  });
  try {
    const review = await prisma.rentalReview.create({
      data: {
        id: reviewId,
        orderId: order.id,
        customerUserId: actor.id,
        variantId: variant.id,
        stars: input.stars,
        content: trimmedOrNull(input.content),
        isAnonymous: input.isAnonymous,
        media: {
          create: promoted.map((item, sortOrder) => ({
            objectKey: item.objectKey,
            contentType: item.contentType,
            sortOrder,
          })),
        },
      },
      include: reviewInclude,
    });
    await Promise.allSettled(promoted.map(({ uploadKey }) => deleteStoredObject(uploadKey)));
    return {
      ...review,
      authorName: review.isAnonymous ? 'Khách thuê' : review.customer.user.displayName,
      media: mediaView(review.media),
    };
  } catch (error) {
    await Promise.allSettled(
      promoted.map(({ objectKey, uploadKey }) =>
        Promise.all([deleteStoredObject(objectKey), deleteStoredObject(uploadKey)]),
      ),
    );
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002')
      throw new AppError(
        409,
        'REVIEW_ALREADY_EXISTS',
        'You have already reviewed this outfit for this order',
      );
    throw error;
  }
}

export async function updateReview(
  actor: AuthenticatedActor,
  reviewId: string,
  input: UpdateReviewInput,
) {
  requireActor(actor);
  const current = await prisma.rentalReview.findUnique({
    where: { id: reviewId },
    include: reviewInclude,
  });
  if (!current) throw new AppError(404, 'REVIEW_NOT_FOUND', 'Review not found');
  if (
    current.customerUserId !== actor.id ||
    !hasPermission(actor, { module: 'rentals', action: 'manage', scope: 'OWN' })
  )
    throw new AppError(403, 'FORBIDDEN', 'Only the renter can edit this review');
  if (Date.now() - current.createdAt.getTime() > editWindowMs)
    throw new AppError(
      409,
      'REVIEW_EDIT_WINDOW_CLOSED',
      'Reviews can only be edited within 30 days',
    );
  const uploadKeys = assertUploadKeys(
    current.orderId,
    current.variantId,
    actor.id,
    input.uploadKeys,
  );
  const keepIds = [...new Set(input.keepMediaIds)];
  if (
    keepIds.length !== input.keepMediaIds.length ||
    keepIds.some((id) => !current.media.some((item) => item.id === id))
  )
    throw new AppError(
      400,
      'INVALID_REVIEW_MEDIA',
      'One or more selected review photos do not belong to this review',
    );
  if (keepIds.length + uploadKeys.length > 5)
    throw new AppError(400, 'TOO_MANY_REVIEW_PHOTOS', 'A review can include up to five photos');
  const promoted = await promoteReviewUploads({
    reviewId: current.id,
    modelId: current.variant.model.id,
    variantId: current.variantId,
    uploadKeys,
  });
  const remove = current.media.filter((item) => !keepIds.includes(item.id));
  try {
    const review = await prisma.$transaction(async (tx) => {
      await tx.rentalReviewMedia.deleteMany({ where: { reviewId, id: { notIn: keepIds } } });
      return tx.rentalReview.update({
        where: { id: reviewId },
        data: {
          stars: input.stars,
          content: trimmedOrNull(input.content),
          isAnonymous: input.isAnonymous,
          media: {
            create: promoted.map((item, offset) => ({
              objectKey: item.objectKey,
              contentType: item.contentType,
              sortOrder: keepIds.length + offset,
            })),
          },
        },
        include: reviewInclude,
      });
    });
    await Promise.allSettled([
      ...remove.map(({ objectKey }) => deleteStoredObject(objectKey)),
      ...promoted.map(({ uploadKey }) => deleteStoredObject(uploadKey)),
    ]);
    return {
      ...review,
      authorName: review.isAnonymous ? 'Khách thuê' : review.customer.user.displayName,
      media: mediaView(review.media),
    };
  } catch (error) {
    await Promise.allSettled(
      promoted.map(({ objectKey, uploadKey }) =>
        Promise.all([deleteStoredObject(objectKey), deleteStoredObject(uploadKey)]),
      ),
    );
    throw error;
  }
}

export async function listPublicModelReviews(modelId: string, query: ReviewListInput) {
  const model = await prisma.costumeModel.findFirst({
    where: { id: modelId, status: 'ACTIVE', category: { is: { status: 'ACTIVE' } } },
    select: { id: true },
  });
  if (!model) throw new AppError(404, 'MODEL_NOT_FOUND', 'Model not found');
  const allWhere: Prisma.RentalReviewWhereInput = { status: 'PUBLISHED', variant: { modelId } };
  const where: Prisma.RentalReviewWhereInput = {
    ...allWhere,
    ...(query.rating ? { stars: query.rating } : {}),
    ...(query.hasPhotos === undefined
      ? {}
      : query.hasPhotos
        ? { media: { some: {} } }
        : { media: { none: {} } }),
  };
  const orderBy =
    query.sort === 'rating-high'
      ? { stars: 'desc' as const }
      : query.sort === 'rating-low'
        ? { stars: 'asc' as const }
        : { createdAt: 'desc' as const };
  const [aggregate, distribution, items, totalItems] = await prisma.$transaction([
    prisma.rentalReview.aggregate({
      where: allWhere,
      _avg: { stars: true },
      _count: { _all: true },
    }),
    prisma.rentalReview.groupBy({ by: ['stars'], where: allWhere, _count: { _all: true } }),
    prisma.rentalReview.findMany({
      where,
      include: {
        variant: { select: { variantCode: true, sizeCode: true, colorCode: true } },
        customer: { select: { user: { select: { displayName: true } } } },
        media: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            objectKey: true,
            contentType: true,
            sortOrder: true,
            createdAt: true,
          },
        },
      },
      orderBy: [orderBy, { id: 'desc' }],
      ...pagination(query),
    }),
    prisma.rentalReview.count({ where }),
  ]);
  return {
    summary: {
      average: aggregate._avg.stars ?? 0,
      count: aggregate._count._all,
      distribution: distribution.map((entry) => ({ stars: entry.stars, count: entry._count._all })),
    },
    ...pageResult(
      items.map((item) => ({
        id: item.id,
        stars: item.stars,
        content: item.content,
        authorName: item.isAnonymous ? 'Khách thuê' : item.customer.user.displayName,
        createdAt: item.createdAt,
        variant: item.variant,
        media: mediaView(item.media),
      })),
      totalItems,
      query,
    ),
  };
}

export async function listAdminReviews(actor: AuthenticatedActor, query: AdminReviewListInput) {
  assertPermission(actor, { module: 'catalog', action: 'manage' });
  const searchConditions: Prisma.RentalReviewWhereInput[] = query.search
    ? [
        { content: { contains: query.search, mode: 'insensitive' } },
        { order: { is: { orderCode: { contains: query.search, mode: 'insensitive' } } } },
        {
          variant: {
            is: { model: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
          },
        },
        {
          customer: {
            is: { user: { is: { displayName: { contains: query.search, mode: 'insensitive' } } } },
          },
        },
      ]
    : [];
  const where: Prisma.RentalReviewWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.rating ? { stars: query.rating } : {}),
    ...(searchConditions.length ? { OR: searchConditions } : {}),
  };
  const [items, totalItems] = await prisma.$transaction([
    prisma.rentalReview.findMany({
      where,
      include: reviewInclude,
      orderBy: { createdAt: 'desc' },
      ...pagination(query),
    }),
    prisma.rentalReview.count({ where }),
  ]);
  return pageResult(
    items.map((review) => ({
      ...review,
      authorName: review.isAnonymous ? 'Khách thuê' : review.customer.user.displayName,
      media: mediaView(review.media),
    })),
    totalItems,
    query,
  );
}

export async function moderateReview(
  actor: AuthenticatedActor,
  reviewId: string,
  input: { status: 'PUBLISHED' | 'HIDDEN'; note?: string | null },
) {
  assertPermission(actor, { module: 'catalog', action: 'manage' });
  const review = await prisma.rentalReview
    .update({
      where: { id: reviewId },
      data: {
        status: input.status,
        moderationNote: trimmedOrNull(input.note),
        moderatedAt: new Date(),
      },
      include: reviewInclude,
    })
    .catch((error: unknown) => {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025')
        throw new AppError(404, 'REVIEW_NOT_FOUND', 'Review not found');
      throw error;
    });
  return {
    ...review,
    authorName: review.isAnonymous ? 'Khách thuê' : review.customer.user.displayName,
    media: mediaView(review.media),
  };
}
