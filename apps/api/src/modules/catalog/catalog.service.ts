import { AppError } from '../../common/errors/app-error.js';
import { pageResult, pagination } from '../../common/http/query.js';
import { prisma } from '../../database/prisma.js';
import { assertPermission, type AuthenticatedActor } from '../auth/authorization.js';
import type {
  AccessoryInput,
  CategoryInput,
  ListCatalogInput,
  MediaInput,
  ModelInput,
  VariantInput,
} from './catalog.schema.js';

function read(actor: AuthenticatedActor) {
  assertPermission(actor, { module: 'catalog', action: 'read' });
}
function manage(actor: AuthenticatedActor) {
  assertPermission(actor, { module: 'catalog', action: 'manage' });
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
      orderBy: { createdAt: 'desc' },
      ...pagination(query),
    }),
    prisma.costumeCategory.count({ where }),
  ]);
  return pageResult(items, totalItems, query);
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
  }
  return prisma.costumeCategory.update({ where: { id }, data: input });
}
export async function setCategoryStatus(
  actor: AuthenticatedActor,
  id: string,
  status: 'ACTIVE' | 'INACTIVE',
) {
  manage(actor);
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
  };
  const [items, totalItems] = await prisma.$transaction([
    prisma.costumeModel.findMany({
      where,
      include: { category: true },
      orderBy: { createdAt: 'desc' },
      ...pagination(query),
    }),
    prisma.costumeModel.count({ where }),
  ]);
  return pageResult(items, totalItems, query);
}
export async function createModel(actor: AuthenticatedActor, input: ModelInput) {
  manage(actor);
  return prisma.costumeModel.create({
    data: { ...input, modelCode: input.modelCode.toUpperCase() },
  });
}
export async function updateModel(
  actor: AuthenticatedActor,
  id: string,
  input: Partial<ModelInput>,
) {
  manage(actor);
  const item = await prisma.costumeModel.findUnique({
    where: { id },
    include: { variants: { select: { id: true } } },
  });
  if (!item) throw new AppError(404, 'MODEL_NOT_FOUND', 'Model not found');
  if (item.variants.length > 0 && (input.modelCode || input.categoryId))
    throw new AppError(409, 'MODEL_IMMUTABLE', 'Used model code and category cannot be changed');
  return prisma.costumeModel.update({ where: { id }, data: input });
}
export async function setModelStatus(
  actor: AuthenticatedActor,
  id: string,
  status: 'ACTIVE' | 'INACTIVE',
) {
  manage(actor);
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
  };
  const [items, totalItems] = await prisma.$transaction([
    prisma.costumeVariant.findMany({
      where,
      include: { model: true },
      orderBy: { createdAt: 'desc' },
      ...pagination(query),
    }),
    prisma.costumeVariant.count({ where }),
  ]);
  return pageResult(items, totalItems, query);
}
export async function createVariant(actor: AuthenticatedActor, input: VariantInput) {
  manage(actor);
  return prisma.costumeVariant.create({
    data: { ...input, variantCode: input.variantCode.toUpperCase() },
  });
}
export async function updateVariant(
  actor: AuthenticatedActor,
  id: string,
  input: Partial<VariantInput>,
) {
  manage(actor);
  const item = await prisma.costumeVariant.findUnique({
    where: { id },
    include: { units: { select: { id: true } }, orderItems: { select: { id: true } } },
  });
  if (!item) throw new AppError(404, 'VARIANT_NOT_FOUND', 'Variant not found');
  if ((item.units.length > 0 || item.orderItems.length > 0) && (input.variantCode || input.modelId))
    throw new AppError(409, 'VARIANT_IMMUTABLE', 'Used variant code and model cannot be changed');
  return prisma.costumeVariant.update({ where: { id }, data: input });
}
export async function setVariantStatus(
  actor: AuthenticatedActor,
  id: string,
  status: 'ACTIVE' | 'INACTIVE',
) {
  manage(actor);
  return prisma.costumeVariant.update({ where: { id }, data: { status } });
}

export async function listAccessories(actor: AuthenticatedActor, modelId: string) {
  read(actor);
  return prisma.costumeModelAccessory.findMany({ where: { modelId }, orderBy: { name: 'asc' } });
}
export async function createAccessory(
  actor: AuthenticatedActor,
  modelId: string,
  input: AccessoryInput,
) {
  manage(actor);
  return prisma.costumeModelAccessory.create({ data: { ...input, modelId } });
}
export async function updateAccessory(
  actor: AuthenticatedActor,
  id: string,
  input: Partial<AccessoryInput>,
) {
  manage(actor);
  return prisma.costumeModelAccessory.update({ where: { id }, data: input });
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
export async function deleteMedia(actor: AuthenticatedActor, id: string) {
  manage(actor);
  await prisma.costumeMedia.delete({ where: { id } });
}
