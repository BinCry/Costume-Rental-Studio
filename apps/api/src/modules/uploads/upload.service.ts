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
