import { AppError } from '../../common/errors/app-error.js';
import { pageResult, pagination } from '../../common/http/query.js';
import {
  deleteStoredObject,
  imageContentTypeForKey,
  promoteStoredImage,
  publicObjectUrl,
} from '../../common/storage/s3.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { assertPermission, type AuthenticatedActor } from '../auth/authorization.js';
import { outboxEventTypes } from '../outbox/outbox.events.js';
import { enqueueOutboxEvent } from '../outbox/outbox.service.js';
import { catalogMediaKey } from '../uploads/upload.service.js';
import type {
  AccessoryInput,
  CategoryInput,
  ListCatalogInput,
  MediaInput,
  MediaUpdateInput,
  ModelInput,
  ModelUpdateInput,
  VariantInput,
  VariantUpdateInput,
} from './catalog.schema.js';

function read(actor: AuthenticatedActor) {
  assertPermission(actor, { module: 'catalog', action: 'read' });
}
function manage(actor: AuthenticatedActor) {
  assertPermission(actor, { module: 'catalog', action: 'manage' });
}
function mediaResponse<T extends { objectKey: string; sourceUploadKey?: string | null }>(item: T) {
  const { sourceUploadKey, ...publicFields } = item;
  void sourceUploadKey;
  return { ...publicFields, mediaUrl: publicObjectUrl(item.objectKey) };
}
function isUniqueConstraintError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
function categoryOrder(query: ListCatalogInput) {
  return {
    [['name', 'updatedAt', 'createdAt'].includes(query.sortBy) ? query.sortBy : 'createdAt']:
      query.sortOrder,
  };
}
function modelOrder(query: ListCatalogInput) {
  return {
    [['name', 'modelCode', 'updatedAt', 'createdAt'].includes(query.sortBy)
      ? query.sortBy
      : 'createdAt']: query.sortOrder,
  };
}
function variantOrder(query: ListCatalogInput) {
  return {
    [['variantCode', 'sizeCode', 'colorCode', 'updatedAt', 'createdAt'].includes(query.sortBy)
      ? query.sortBy
      : 'createdAt']: query.sortOrder,
  };
}
async function lockActiveCategory(transaction: Prisma.TransactionClient, categoryId: string) {
  const categories = await transaction.$queryRaw<{ id: string; status: string }[]>`
    SELECT id, status
    FROM costume_categories
    WHERE id = ${categoryId}::uuid
    FOR UPDATE
  `;
  if (categories[0]?.status !== 'ACTIVE')
    throw new AppError(400, 'INVALID_CATEGORY', 'Category must exist and be active');
}
async function lockCatalogHierarchy(transaction: Prisma.TransactionClient) {
  // Serialize parent changes and activation with subtree status changes. Row locks alone cannot
  // prevent recursive snapshots or parent IDs read before a transaction from becoming stale.
  await transaction.$queryRaw<{ lock: string }[]>`
    SELECT pg_advisory_xact_lock(112835284, 1)::text AS lock
  `;
}
async function lockActiveModel(transaction: Prisma.TransactionClient, modelId: string) {
  const models = await transaction.$queryRaw<{ id: string; status: string }[]>`
    SELECT id, status
    FROM costume_models
    WHERE id = ${modelId}::uuid
    FOR UPDATE
  `;
  if (models[0]?.status !== 'ACTIVE')
    throw new AppError(400, 'INVALID_MODEL', 'Model must exist and be active');
}

export async function listCategories(actor: AuthenticatedActor, query: ListCatalogInput) {
  read(actor);
  const where = {
    ...(query.search ? { name: { contains: query.search, mode: 'insensitive' as const } } : {}),
    ...(query.status ? { status: query.status } : {}),
  };
  const [items, totalItems] = await prisma.$transaction([
    prisma.costumeCategory.findMany({
      where,
      orderBy: categoryOrder(query),
      ...pagination(query),
    }),
    prisma.costumeCategory.count({ where }),
  ]);
  return pageResult(items, totalItems, query);
}
export async function getCategory(actor: AuthenticatedActor, id: string) {
  read(actor);
  const item = await prisma.costumeCategory.findUnique({
    where: { id },
    include: { parent: true },
  });
  if (!item) throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
  return item;
}
export async function createCategory(actor: AuthenticatedActor, input: CategoryInput) {
  manage(actor);
  if (!input.parentId) return prisma.costumeCategory.create({ data: input });
  return prisma.$transaction(async (transaction) => {
    await lockCatalogHierarchy(transaction);
    try {
      await lockActiveCategory(transaction, input.parentId!);
    } catch (error: unknown) {
      if (error instanceof AppError)
        throw new AppError(400, 'INVALID_PARENT', 'Parent category must exist and be active');
      throw error;
    }
    return transaction.costumeCategory.create({ data: input });
  });
}
export async function updateCategory(
  actor: AuthenticatedActor,
  id: string,
  input: Partial<CategoryInput>,
) {
  manage(actor);
  const item = await prisma.costumeCategory.findUnique({ where: { id } });
  if (!item) throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
  if (input.parentId === id)
    throw new AppError(400, 'INVALID_PARENT', 'Category cannot be its own parent');
  if (input.parentId === undefined)
    return prisma.costumeCategory.update({ where: { id }, data: input });
  const parentId = input.parentId;
  return prisma.$transaction(async (transaction) => {
    await lockCatalogHierarchy(transaction);
    if (parentId) {
      try {
        await lockActiveCategory(transaction, parentId);
      } catch (error: unknown) {
        if (error instanceof AppError)
          throw new AppError(400, 'INVALID_PARENT', 'Parent category must exist and be active');
        throw error;
      }
    }
    await transaction.$queryRaw<{ id: string }[]>`
      SELECT id FROM costume_categories WHERE id = ${id}::uuid FOR UPDATE
    `;
    let cursor = parentId
      ? await transaction.costumeCategory.findUnique({ where: { id: parentId } })
      : null;
    while (cursor?.parentId) {
      if (cursor.parentId === id)
        throw new AppError(400, 'CATEGORY_CYCLE', 'Category parent cannot create a cycle');
      cursor = await transaction.costumeCategory.findUnique({
        where: { id: cursor.parentId },
      });
    }
    return transaction.costumeCategory.update({ where: { id }, data: input });
  });
}
export async function setCategoryStatus(
  actor: AuthenticatedActor,
  id: string,
  status: 'ACTIVE' | 'INACTIVE',
) {
  manage(actor);
  const item = await prisma.costumeCategory.findUnique({ where: { id } });
  if (!item) throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
  if (status === 'ACTIVE') {
    return prisma.$transaction(async (transaction) => {
      await lockCatalogHierarchy(transaction);
      const current = await transaction.costumeCategory.findUnique({ where: { id } });
      if (!current) throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
      if (current.parentId) {
        try {
          await lockActiveCategory(transaction, current.parentId);
        } catch (error: unknown) {
          if (error instanceof AppError)
            throw new AppError(400, 'INVALID_PARENT', 'Parent category must exist and be active');
          throw error;
        }
      }
      return transaction.costumeCategory.update({ where: { id }, data: { status } });
    });
  }

  return prisma.$transaction(async (transaction) => {
    await lockCatalogHierarchy(transaction);
    const root = await transaction.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM costume_categories
      WHERE id = ${id}::uuid
      FOR UPDATE
    `;
    if (root.length === 0) throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Category not found');

    const categories = await transaction.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE category_tree AS (
        SELECT id
        FROM costume_categories
        WHERE id = ${id}::uuid

        UNION

        SELECT child.id
        FROM costume_categories child
        INNER JOIN category_tree parent ON child.parent_id = parent.id
      )
      SELECT category.id
      FROM costume_categories category
      INNER JOIN category_tree tree ON tree.id = category.id
      FOR UPDATE OF category
    `;
    if (categories.length === 0)
      throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Category not found');

    const categoryIds = categories.map((category) => category.id);
    await transaction.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM costume_models
      WHERE category_id = ANY(${categoryIds}::uuid[])
      FOR UPDATE
    `;
    await transaction.costumeModelAccessory.updateMany({
      where: { model: { categoryId: { in: categoryIds } }, isActive: true },
      data: { isActive: false },
    });
    await transaction.costumeVariant.updateMany({
      where: { model: { categoryId: { in: categoryIds } }, status: 'ACTIVE' },
      data: { status: 'INACTIVE' },
    });
    await transaction.costumeModel.updateMany({
      where: { categoryId: { in: categoryIds }, status: 'ACTIVE' },
      data: { status: 'INACTIVE' },
    });
    await transaction.costumeCategory.updateMany({
      where: { id: { in: categoryIds }, status: 'ACTIVE' },
      data: { status: 'INACTIVE' },
    });

    const updated = await transaction.costumeCategory.findUnique({ where: { id } });
    if (!updated) throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
    return updated;
  });
}
export async function deleteCategory(actor: AuthenticatedActor, id: string) {
  manage(actor);
  await prisma.$transaction(async (transaction) => {
    await lockCatalogHierarchy(transaction);
    const rows = await transaction.$queryRaw<{ id: string }[]>`
      SELECT id FROM costume_categories WHERE id = ${id}::uuid FOR UPDATE
    `;
    if (rows.length === 0) throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
    const childCount = await transaction.costumeCategory.count({ where: { parentId: id } });
    const modelCount = await transaction.costumeModel.count({ where: { categoryId: id } });
    if (childCount > 0 || modelCount > 0)
      throw new AppError(
        409,
        'CATEGORY_IN_USE',
        'Category has child categories or models; deactivate it instead',
      );
    await transaction.costumeCategory.delete({ where: { id } });
  });
}

export async function listModels(actor: AuthenticatedActor, query: ListCatalogInput) {
  read(actor);
  const where = {
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { modelCode: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
  };
  const [items, totalItems] = await prisma.$transaction([
    prisma.costumeModel.findMany({
      where,
      include: { category: true },
      orderBy: modelOrder(query),
      ...pagination(query),
    }),
    prisma.costumeModel.count({ where }),
  ]);
  return pageResult(items, totalItems, query);
}
export async function getModel(actor: AuthenticatedActor, id: string) {
  read(actor);
  const item = await prisma.costumeModel.findUnique({ where: { id }, include: { category: true } });
  if (!item) throw new AppError(404, 'MODEL_NOT_FOUND', 'Model not found');
  return item;
}
export async function createModel(actor: AuthenticatedActor, input: ModelInput) {
  manage(actor);
  return prisma.$transaction(async (transaction) => {
    await lockActiveCategory(transaction, input.categoryId);
    return transaction.costumeModel.create({
      data: { ...input, modelCode: input.modelCode.toUpperCase() },
    });
  });
}
export async function updateModel(actor: AuthenticatedActor, id: string, input: ModelUpdateInput) {
  manage(actor);
  const item = await prisma.costumeModel.findUnique({
    where: { id },
    include: { variants: { select: { id: true } } },
  });
  if (!item) throw new AppError(404, 'MODEL_NOT_FOUND', 'Model not found');
  if (item.variants.length > 0 && (input.modelCode || input.categoryId))
    throw new AppError(409, 'MODEL_IMMUTABLE', 'Used model code and category cannot be changed');
  const data = {
    ...input,
    ...(input.modelCode === undefined ? {} : { modelCode: input.modelCode.toUpperCase() }),
  };
  if (!input.categoryId) return prisma.costumeModel.update({ where: { id }, data });
  return prisma.$transaction(async (transaction) => {
    await lockCatalogHierarchy(transaction);
    await lockActiveCategory(transaction, input.categoryId!);
    await transaction.$queryRaw<{ id: string }[]>`
      SELECT id FROM costume_models WHERE id = ${id}::uuid FOR UPDATE
    `;
    return transaction.costumeModel.update({ where: { id }, data });
  });
}
export async function setModelStatus(
  actor: AuthenticatedActor,
  id: string,
  status: 'ACTIVE' | 'INACTIVE',
) {
  manage(actor);
  const item = await prisma.costumeModel.findUnique({ where: { id } });
  if (!item) throw new AppError(404, 'MODEL_NOT_FOUND', 'Model not found');
  if (status === 'INACTIVE') {
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw<{ id: string }[]>`
        SELECT id FROM costume_models WHERE id = ${id}::uuid FOR UPDATE
      `;
      const activeVariants = await transaction.costumeVariant.count({
        where: { modelId: id, status: 'ACTIVE' },
      });
      if (activeVariants)
        throw new AppError(409, 'MODEL_HAS_ACTIVE_VARIANTS', 'Deactivate active variants first');
      return transaction.costumeModel.update({ where: { id }, data: { status } });
    });
  }
  return prisma.$transaction(async (transaction) => {
    await lockCatalogHierarchy(transaction);
    const current = await transaction.costumeModel.findUnique({ where: { id } });
    if (!current) throw new AppError(404, 'MODEL_NOT_FOUND', 'Model not found');
    await lockActiveCategory(transaction, current.categoryId);
    return transaction.costumeModel.update({ where: { id }, data: { status } });
  });
}
export async function deleteModel(actor: AuthenticatedActor, id: string) {
  manage(actor);
  await prisma.$transaction(async (transaction) => {
    await lockCatalogHierarchy(transaction);
    const rows = await transaction.$queryRaw<{ id: string }[]>`
      SELECT id FROM costume_models WHERE id = ${id}::uuid FOR UPDATE
    `;
    if (rows.length === 0) throw new AppError(404, 'MODEL_NOT_FOUND', 'Model not found');
    const variantCount = await transaction.costumeVariant.count({ where: { modelId: id } });
    const accessoryCount = await transaction.costumeModelAccessory.count({
      where: { modelId: id },
    });
    const mediaCount = await transaction.costumeMedia.count({ where: { modelId: id } });
    if (variantCount > 0 || accessoryCount > 0 || mediaCount > 0)
      throw new AppError(
        409,
        'MODEL_IN_USE',
        'Model has variants, accessories, media, or related business data; deactivate it instead',
      );
    await transaction.costumeModel.delete({ where: { id } });
  });
}

export async function listVariants(actor: AuthenticatedActor, query: ListCatalogInput) {
  read(actor);
  const where = {
    ...(query.search
      ? {
          OR: [
            { variantCode: { contains: query.search, mode: 'insensitive' as const } },
            { sizeCode: { contains: query.search, mode: 'insensitive' as const } },
            { colorCode: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.modelId ? { modelId: query.modelId } : {}),
    ...(query.sizeCode ? { sizeCode: query.sizeCode } : {}),
    ...(query.colorCode ? { colorCode: query.colorCode } : {}),
  };
  const [items, totalItems] = await prisma.$transaction([
    prisma.costumeVariant.findMany({
      where,
      include: { model: true },
      orderBy: variantOrder(query),
      ...pagination(query),
    }),
    prisma.costumeVariant.count({ where }),
  ]);
  return pageResult(items, totalItems, query);
}
export async function getVariant(actor: AuthenticatedActor, id: string) {
  read(actor);
  const item = await prisma.costumeVariant.findUnique({
    where: { id },
    include: { model: { include: { category: true } } },
  });
  if (!item) throw new AppError(404, 'VARIANT_NOT_FOUND', 'Variant not found');
  return item;
}
export async function createVariant(actor: AuthenticatedActor, input: VariantInput) {
  manage(actor);
  return prisma.$transaction(async (transaction) => {
    await lockActiveModel(transaction, input.modelId);
    return transaction.costumeVariant.create({
      data: { ...input, variantCode: input.variantCode.toUpperCase() },
    });
  });
}
export async function updateVariant(
  actor: AuthenticatedActor,
  id: string,
  input: VariantUpdateInput,
) {
  manage(actor);
  const item = await prisma.costumeVariant.findUnique({
    where: { id },
    include: { units: { select: { id: true } }, orderItems: { select: { id: true } } },
  });
  if (!item) throw new AppError(404, 'VARIANT_NOT_FOUND', 'Variant not found');
  if ((item.units.length > 0 || item.orderItems.length > 0) && (input.variantCode || input.modelId))
    throw new AppError(409, 'VARIANT_IMMUTABLE', 'Used variant code and model cannot be changed');
  const deposit = input.depositAmountVnd ?? item.depositAmountVnd;
  const replacement = input.replacementValueVnd ?? item.replacementValueVnd;
  if (replacement < deposit)
    throw new AppError(400, 'VALIDATION_ERROR', 'Replacement value must cover deposit');
  const data = {
    ...input,
    ...(input.variantCode === undefined ? {} : { variantCode: input.variantCode.toUpperCase() }),
  };
  if (!input.modelId) return prisma.costumeVariant.update({ where: { id }, data });
  return prisma.$transaction(async (transaction) => {
    await lockCatalogHierarchy(transaction);
    await lockActiveModel(transaction, input.modelId!);
    return transaction.costumeVariant.update({ where: { id }, data });
  });
}
export async function setVariantStatus(
  actor: AuthenticatedActor,
  id: string,
  status: 'ACTIVE' | 'INACTIVE',
) {
  manage(actor);
  const item = await prisma.costumeVariant.findUnique({ where: { id } });
  if (!item) throw new AppError(404, 'VARIANT_NOT_FOUND', 'Variant not found');
  if (status === 'INACTIVE')
    return prisma.costumeVariant.update({ where: { id }, data: { status } });
  return prisma.$transaction(async (transaction) => {
    await lockCatalogHierarchy(transaction);
    const current = await transaction.costumeVariant.findUnique({ where: { id } });
    if (!current) throw new AppError(404, 'VARIANT_NOT_FOUND', 'Variant not found');
    await lockActiveModel(transaction, current.modelId);
    return transaction.costumeVariant.update({ where: { id }, data: { status } });
  });
}
export async function deleteVariant(actor: AuthenticatedActor, id: string) {
  manage(actor);
  await prisma.$transaction(async (transaction) => {
    await lockCatalogHierarchy(transaction);
    const rows = await transaction.$queryRaw<{ id: string }[]>`
      SELECT id FROM costume_variants WHERE id = ${id}::uuid FOR UPDATE
    `;
    if (rows.length === 0) throw new AppError(404, 'VARIANT_NOT_FOUND', 'Variant not found');
    const mediaCount = await transaction.costumeMedia.count({ where: { variantId: id } });
    const unitCount = await transaction.costumeUnit.count({ where: { variantId: id } });
    const orderItemCount = await transaction.rentalOrderItem.count({ where: { variantId: id } });
    if (mediaCount > 0 || unitCount > 0 || orderItemCount > 0)
      throw new AppError(
        409,
        'VARIANT_IN_USE',
        'Variant has units, order items, or media; deactivate it instead',
      );
    await transaction.costumeVariant.delete({ where: { id } });
  });
}

export async function listAccessories(actor: AuthenticatedActor, modelId: string) {
  read(actor);
  const model = await prisma.costumeModel.findUnique({ where: { id: modelId } });
  if (!model) throw new AppError(404, 'MODEL_NOT_FOUND', 'Model not found');
  return prisma.costumeModelAccessory.findMany({ where: { modelId }, orderBy: { name: 'asc' } });
}
export async function createAccessory(
  actor: AuthenticatedActor,
  modelId: string,
  input: AccessoryInput,
) {
  manage(actor);
  return prisma.$transaction(async (transaction) => {
    await lockActiveModel(transaction, modelId);
    return transaction.costumeModelAccessory.create({ data: { ...input, modelId } });
  });
}
export async function updateAccessory(
  actor: AuthenticatedActor,
  id: string,
  input: Partial<AccessoryInput>,
) {
  manage(actor);
  const item = await prisma.costumeModelAccessory.findUnique({ where: { id } });
  if (!item) throw new AppError(404, 'ACCESSORY_NOT_FOUND', 'Accessory not found');
  return prisma.costumeModelAccessory.update({ where: { id }, data: input });
}
export async function setAccessoryStatus(actor: AuthenticatedActor, id: string, isActive: boolean) {
  manage(actor);
  const item = await prisma.costumeModelAccessory.findUnique({ where: { id } });
  if (!item) throw new AppError(404, 'ACCESSORY_NOT_FOUND', 'Accessory not found');
  if (isActive) {
    return prisma.$transaction(async (transaction) => {
      await lockActiveModel(transaction, item.modelId);
      return transaction.costumeModelAccessory.update({ where: { id }, data: { isActive } });
    });
  }
  return prisma.costumeModelAccessory.update({ where: { id }, data: { isActive } });
}
export async function deleteAccessory(actor: AuthenticatedActor, id: string) {
  manage(actor);
  await prisma.$transaction(async (transaction) => {
    await lockCatalogHierarchy(transaction);
    const rows = await transaction.$queryRaw<{ id: string }[]>`
      SELECT id FROM costume_model_accessories WHERE id = ${id}::uuid FOR UPDATE
    `;
    if (rows.length === 0) throw new AppError(404, 'ACCESSORY_NOT_FOUND', 'Accessory not found');
    const snapshotCount = await transaction.rentalItemAccessory.count({
      where: { modelAccessoryId: id },
    });
    if (snapshotCount > 0)
      throw new AppError(
        409,
        'ACCESSORY_IN_USE',
        'Accessory appears in rental history; deactivate it instead',
      );
    await transaction.costumeModelAccessory.delete({ where: { id } });
  });
}
export async function listMedia(
  actor: AuthenticatedActor,
  owner: { modelId?: string; variantId?: string },
) {
  read(actor);
  const items = await prisma.costumeMedia.findMany({ where: owner, orderBy: { sortOrder: 'asc' } });
  return items.map(mediaResponse);
}
export async function createMedia(
  actor: AuthenticatedActor,
  owner: { modelId?: string; variantId?: string },
  input: MediaInput,
) {
  manage(actor);
  if ((!owner.modelId && !owner.variantId) || (owner.modelId && owner.variantId))
    throw new AppError(400, 'INVALID_MEDIA_OWNER', 'Media must belong to exactly one resource');
  const ownerType = owner.modelId ? 'model' : 'variant';
  const ownerId = owner.modelId ?? owner.variantId;
  if (!ownerId)
    throw new AppError(400, 'INVALID_MEDIA_OWNER', 'Media must belong to exactly one resource');
  const ownerExists =
    ownerType === 'model'
      ? await prisma.costumeModel.findUnique({ where: { id: ownerId }, select: { id: true } })
      : await prisma.costumeVariant.findUnique({ where: { id: ownerId }, select: { id: true } });
  if (!ownerExists)
    throw new AppError(
      404,
      ownerType === 'model' ? 'MODEL_NOT_FOUND' : 'VARIANT_NOT_FOUND',
      `${ownerType === 'model' ? 'Model' : 'Variant'} not found`,
    );
  const mediaLimit =
    ownerType === 'model' ? env.MEDIA_MAX_MODEL_IMAGES : env.MEDIA_MAX_VARIANT_IMAGES;
  const mediaCount = await prisma.costumeMedia.count({ where: owner });
  if (mediaCount >= mediaLimit)
    throw new AppError(
      409,
      'MEDIA_LIMIT_REACHED',
      `${ownerType === 'model' ? 'Model' : 'Variant'} may have at most ${mediaLimit} images`,
    );
  const expectedPrefix = `catalog-staging/${ownerType}s/${ownerId}/`;
  if (!input.uploadKey.startsWith(expectedPrefix))
    throw new AppError(400, 'INVALID_UPLOAD', 'Upload key does not belong to this catalog item');
  const contentType = imageContentTypeForKey(input.uploadKey);
  if (!contentType)
    throw new AppError(400, 'INVALID_UPLOAD', 'Upload key must use a supported image extension');
  if (await prisma.costumeMedia.findUnique({ where: { sourceUploadKey: input.uploadKey } }))
    throw new AppError(409, 'MEDIA_ALREADY_REGISTERED', 'Image is already registered');
  const objectKey = catalogMediaKey(ownerType, ownerId, contentType);
  await promoteStoredImage({
    uploadKey: input.uploadKey,
    objectKey,
    contentType,
    maxBytes: env.MEDIA_MAX_UPLOAD_BYTES,
  });
  try {
    const media = await prisma.$transaction(async (transaction) => {
      // Shared database row lock serializes finalization for this owner across API instances.
      // Storage I/O stays outside the transaction to keep the lock short-lived.
      const rows =
        ownerType === 'model'
          ? await transaction.$queryRaw<{ id: string }[]>`
            SELECT id FROM costume_models WHERE id = ${ownerId}::uuid FOR UPDATE`
          : await transaction.$queryRaw<{ id: string }[]>`
            SELECT id FROM costume_variants WHERE id = ${ownerId}::uuid FOR UPDATE`;
      if (rows.length === 0)
        throw new AppError(404, 'MEDIA_OWNER_NOT_FOUND', 'Catalog item no longer exists');
      if (
        await transaction.costumeMedia.findUnique({ where: { sourceUploadKey: input.uploadKey } })
      )
        throw new AppError(409, 'MEDIA_ALREADY_REGISTERED', 'Image is already registered');
      const currentCount = await transaction.costumeMedia.count({ where: owner });
      if (currentCount >= mediaLimit)
        throw new AppError(
          409,
          'MEDIA_LIMIT_REACHED',
          `${ownerType === 'model' ? 'Model' : 'Variant'} may have at most ${mediaLimit} images`,
        );
      return transaction.costumeMedia.create({
        data: {
          objectKey,
          sourceUploadKey: input.uploadKey,
          sortOrder: input.sortOrder,
          ...(input.altText === undefined ? {} : { altText: input.altText }),
          ...owner,
        },
      });
    });
    try {
      await deleteStoredObject(input.uploadKey);
    } catch (error: unknown) {
      logger.warn(
        { err: error, uploadKey: input.uploadKey },
        'Could not immediately remove finalized staging image; cleanup will retry later',
      );
    }
    return mediaResponse(media);
  } catch (error: unknown) {
    // Only clean up definitely rejected writes. An unknown transaction/connection error
    // can have an ambiguous commit result; the orphan sweeper handles that safely later.
    if (error instanceof AppError || isUniqueConstraintError(error)) {
      try {
        await deleteStoredObject(objectKey);
      } catch (cleanupError: unknown) {
        logger.warn(
          { err: cleanupError, objectKey },
          'Could not remove rejected final image; cleanup will retry',
        );
      }
    }
    if (isUniqueConstraintError(error))
      throw new AppError(409, 'MEDIA_ALREADY_REGISTERED', 'Image is already registered');
    throw error;
  }
}
export async function updateMedia(actor: AuthenticatedActor, id: string, input: MediaUpdateInput) {
  manage(actor);
  const item = await prisma.costumeMedia.findUnique({ where: { id } });
  if (!item) throw new AppError(404, 'MEDIA_NOT_FOUND', 'Media not found');
  return mediaResponse(await prisma.costumeMedia.update({ where: { id }, data: input }));
}
export async function deleteMedia(actor: AuthenticatedActor, id: string) {
  manage(actor);
  const item = await prisma.costumeMedia.findUnique({ where: { id } });
  if (!item) throw new AppError(404, 'MEDIA_NOT_FOUND', 'Media not found');
  const event = await prisma.$transaction(async (transaction) => {
    await transaction.costumeMedia.delete({ where: { id } });
    return enqueueOutboxEvent(transaction, {
      eventType: outboxEventTypes.mediaObjectDeleteRequested,
      aggregateType: 'CostumeMedia',
      aggregateId: item.id,
      payloadJson: { objectKey: item.objectKey },
      availableAt: new Date(Date.now() + 30_000),
      deduplicationKey: `costume-media-delete:${item.id}`,
    });
  });

  try {
    await deleteStoredObject(item.objectKey);
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { status: 'PROCESSED', processedAt: new Date(), lastError: null },
    });
  } catch (error: unknown) {
    logger.warn(
      { err: error, objectKey: item.objectKey, mediaId: item.id, outboxEventId: event.id },
      'Could not complete immediate media deletion; outbox will retry',
    );
  }
}
