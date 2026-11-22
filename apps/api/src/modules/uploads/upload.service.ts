import { randomUUID } from 'node:crypto';

import { AppError } from '../../common/errors/app-error.js';
import { createPresignedPostUrl, type AllowedImageContentType } from '../../common/storage/s3.js';
import { env } from '../../config/env.js';
import { prisma } from '../../database/prisma.js';
import { assertPermission, hasPermission, type AuthenticatedActor } from '../auth/authorization.js';
import type { CreatePresignedUploadInput } from './upload.schema.js';

const extensionByContentType: Record<AllowedImageContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

async function assertOwnerExists(
  ownerType: CreatePresignedUploadInput['ownerType'],
  ownerId: string,
) {
  const owner =
    ownerType === 'model'
      ? await prisma.costumeModel.findUnique({ where: { id: ownerId }, select: { id: true } })
      : await prisma.costumeVariant.findUnique({ where: { id: ownerId }, select: { id: true } });
  if (!owner)
    throw new AppError(
      404,
      ownerType === 'model' ? 'MODEL_NOT_FOUND' : 'VARIANT_NOT_FOUND',
      `${ownerType === 'model' ? 'Model' : 'Variant'} not found`,
    );
}

export function catalogMediaStagingKey(
  ownerType: 'model' | 'variant',
  ownerId: string,
  contentType: AllowedImageContentType,
) {
  return `catalog-staging/${ownerType}s/${ownerId}/${randomUUID()}.${extensionByContentType[contentType]}`;
}

export function catalogMediaKey(
  ownerType: 'model' | 'variant',
  ownerId: string,
  contentType: AllowedImageContentType,
) {
  return `catalog/${ownerType}s/${ownerId}/${randomUUID()}.${extensionByContentType[contentType]}`;
}

export async function createPresignedUpload(
  actor: AuthenticatedActor,
  input: CreatePresignedUploadInput,
) {
  if (input.size > env.MEDIA_MAX_UPLOAD_BYTES)
    throw new AppError(400, 'FILE_TOO_LARGE', 'Image exceeds the allowed size');
  if (input.purpose === 'catalog-media') {
    assertPermission(actor, { module: 'catalog', action: 'manage' });
    await assertOwnerExists(input.ownerType, input.ownerId);
    const objectKey = catalogMediaStagingKey(input.ownerType, input.ownerId, input.contentType);
    const signed = await createPresignedPostUrl({ key: objectKey, contentType: input.contentType });
    return { objectKey, method: 'POST' as const, ...signed };
  }
  if (input.purpose === 'rental-review') {
    const order = await prisma.rentalOrder.findUnique({
      where: { id: input.ownerId },
      select: {
        id: true,
        customerUserId: true,
        returnedAt: true,
        status: true,
        items: { where: { variantId: input.variantId }, select: { id: true } },
      },
    });
    if (!order) throw new AppError(404, 'RENTAL_ORDER_NOT_FOUND', 'Rental order not found');
    const ownsOrder =
      actor.id === order.customerUserId &&
      hasPermission(actor, {
        module: 'rentals',
        action: 'manage',
        scope: 'OWN',
      });
    if (!ownsOrder)
      throw new AppError(403, 'FORBIDDEN', 'Only the renter can upload review photos');
    if (!order.returnedAt || !['RETURN_INSPECTION', 'COMPLETED'].includes(order.status))
      throw new AppError(
        409,
        'REVIEW_NOT_AVAILABLE',
        'Reviews are available after the outfit is returned',
      );
    if (!order.items.length)
      throw new AppError(
        400,
        'REVIEW_VARIANT_NOT_IN_ORDER',
        'This variant is not part of the rental order',
      );
    const objectKey = `rental-review-staging/orders/${order.id}/variants/${input.variantId}/users/${actor.id}/${randomUUID()}.${extensionByContentType[input.contentType]}`;
    const signed = await createPresignedPostUrl({ key: objectKey, contentType: input.contentType });
    return { objectKey, method: 'POST' as const, ...signed };
  }
  const item = await prisma.rentalOrderItem.findUnique({
    where: { id: input.ownerId },
    select: { id: true, order: { select: { customerUserId: true, pickupBranchId: true } } },
  });
  if (!item) throw new AppError(404, 'ORDER_ITEM_NOT_FOUND', 'Rental order item not found');
  const isOwner =
    actor.id === item.order.customerUserId &&
    hasPermission(actor, { module: 'rentals', action: 'manage', scope: 'OWN' });
  if (!isOwner)
    assertPermission(actor, {
      module: 'rentals',
      action: 'manage',
      branchId: item.order.pickupBranchId,
    });
  const extension = extensionByContentType[input.contentType];
  const objectKey = `rental-staging/items/${item.id}/${input.phase.toLowerCase()}/${randomUUID()}.${extension}`;
  const signed = await createPresignedPostUrl({ key: objectKey, contentType: input.contentType });
  return { objectKey, method: 'POST' as const, ...signed };
}
