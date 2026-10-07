import { AppError } from '../../common/errors/app-error.js';
import { pageResult, pagination } from '../../common/http/query.js';
import { prisma } from '../../database/prisma.js';
import { assertPermission, type AuthenticatedActor } from '../auth/authorization.js';
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
async function assertCategoryActive(categoryId: string) {
  const category = await prisma.costumeCategory.findUnique({ where: { id: categoryId } });
  if (category?.status !== 'ACTIVE')
    throw new AppError(400, 'INVALID_CATEGORY', 'Category must exist and be active');
}
async function assertModelActive(modelId: string) {
  const model = await prisma.costumeModel.findUnique({ where: { id: modelId } });
  if (model?.status !== 'ACTIVE')
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
  if (input.parentId) {
    const parent = await prisma.costumeCategory.findUnique({ where: { id: input.parentId } });
    if (parent?.status !== 'ACTIVE')
      throw new AppError(400, 'INVALID_PARENT', 'Parent category must exist and be active');
  }
  return prisma.costumeCategory.create({ data: input });
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
  if (input.parentId) {
    const parent = await prisma.costumeCategory.findUnique({ where: { id: input.parentId } });
    if (parent?.status !== 'ACTIVE')
      throw new AppError(400, 'INVALID_PARENT', 'Parent category must exist and be active');
    let cursor = parent;
    while (cursor.parentId) {
      if (cursor.parentId === id)
        throw new AppError(400, 'CATEGORY_CYCLE', 'Category parent cannot create a cycle');
      const next: Awaited<ReturnType<typeof prisma.costumeCategory.findUnique>> =
        await prisma.costumeCategory.findUnique({ where: { id: cursor.parentId } });
      if (!next) break;
      cursor = next;
    }
  }
  return prisma.costumeCategory.update({ where: { id }, data: input });
}
export async function setCategoryStatus(
  actor: AuthenticatedActor,
  id: string,
  status: 'ACTIVE' | 'INACTIVE',
) {
  manage(actor);
  const item = await prisma.costumeCategory.findUnique({ where: { id } });
  if (!item) throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
  if (status === 'INACTIVE') {
    const activeModels = await prisma.costumeModel.count({
      where: { categoryId: id, status: 'ACTIVE' },
    });
    if (activeModels)
      throw new AppError(409, 'CATEGORY_HAS_ACTIVE_MODELS', 'Deactivate active models first');
  }
  return prisma.costumeCategory.update({ where: { id }, data: { status } });
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
  await assertCategoryActive(input.categoryId);
  return prisma.costumeModel.create({
    data: { ...input, modelCode: input.modelCode.toUpperCase() },
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
  if (input.categoryId) await assertCategoryActive(input.categoryId);
  return prisma.costumeModel.update({ where: { id }, data: input });
}
export async function setModelStatus(
  actor: AuthenticatedActor,
  id: string,
  status: 'ACTIVE' | 'INACTIVE',
) {
  manage(actor);
  const item = await prisma.costumeModel.findUnique({ where: { id } });
  if (!item) throw new AppError(404, 'MODEL_NOT_FOUND', 'Model not found');
  if (status === 'ACTIVE') await assertCategoryActive(item.categoryId);
  if (status === 'INACTIVE') {
    const activeVariants = await prisma.costumeVariant.count({
      where: { modelId: id, status: 'ACTIVE' },
    });
    if (activeVariants)
      throw new AppError(409, 'MODEL_HAS_ACTIVE_VARIANTS', 'Deactivate active variants first');
  }
  return prisma.costumeModel.update({ where: { id }, data: { status } });
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
  await assertModelActive(input.modelId);
  return prisma.costumeVariant.create({
    data: { ...input, variantCode: input.variantCode.toUpperCase() },
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
  if (input.modelId) await assertModelActive(input.modelId);
  const deposit = input.depositAmountVnd ?? item.depositAmountVnd;
  const replacement = input.replacementValueVnd ?? item.replacementValueVnd;
  if (replacement < deposit)
    throw new AppError(400, 'VALIDATION_ERROR', 'Replacement value must cover deposit');
  return prisma.costumeVariant.update({ where: { id }, data: input });
}
export async function setVariantStatus(
  actor: AuthenticatedActor,
  id: string,
  status: 'ACTIVE' | 'INACTIVE',
) {
  manage(actor);
  const item = await prisma.costumeVariant.findUnique({ where: { id } });
  if (!item) throw new AppError(404, 'VARIANT_NOT_FOUND', 'Variant not found');
  if (status === 'ACTIVE') await assertModelActive(item.modelId);
  return prisma.costumeVariant.update({ where: { id }, data: { status } });
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
  await assertModelActive(modelId);
  return prisma.costumeModelAccessory.create({ data: { ...input, modelId } });
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
  return prisma.costumeModelAccessory.update({ where: { id }, data: { isActive } });
}
export async function listMedia(
  actor: AuthenticatedActor,
  owner: { modelId?: string; variantId?: string },
) {
  read(actor);
  return prisma.costumeMedia.findMany({ where: owner, orderBy: { sortOrder: 'asc' } });
}
export async function createMedia(
  actor: AuthenticatedActor,
  owner: { modelId?: string; variantId?: string },
  input: MediaInput,
) {
  manage(actor);
  if ((!owner.modelId && !owner.variantId) || (owner.modelId && owner.variantId))
    throw new AppError(400, 'INVALID_MEDIA_OWNER', 'Media must belong to exactly one resource');
  return prisma.costumeMedia.create({ data: { ...input, ...owner } });
}
export async function updateMedia(actor: AuthenticatedActor, id: string, input: MediaUpdateInput) {
  manage(actor);
  const item = await prisma.costumeMedia.findUnique({ where: { id } });
  if (!item) throw new AppError(404, 'MEDIA_NOT_FOUND', 'Media not found');
  return prisma.costumeMedia.update({ where: { id }, data: input });
}
export async function deleteMedia(actor: AuthenticatedActor, id: string) {
  manage(actor);
  const item = await prisma.costumeMedia.findUnique({ where: { id } });
  if (!item) throw new AppError(404, 'MEDIA_NOT_FOUND', 'Media not found');
  await prisma.costumeMedia.delete({ where: { id } });
}
