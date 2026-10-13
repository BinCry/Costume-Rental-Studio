import { AppError } from '../../common/errors/app-error.js';
import { pageResult, pagination } from '../../common/http/query.js';
import { publicObjectUrl } from '../../common/storage/s3.js';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  PublicAvailabilityInput,
  PublicBranchListInput,
  PublicCatalogListInput,
} from './public.schema.js';

export async function listPublicBranches(query: PublicBranchListInput) {
  const where: Prisma.BranchWhereInput = {
    status: 'ACTIVE',
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { branchCode: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const orderBy: Prisma.BranchOrderByWithRelationInput = { [query.sortBy]: query.sortOrder };
  const [items, totalItems] = await prisma.$transaction([
    prisma.branch.findMany({
      where,
      select: { id: true, branchCode: true, name: true, address: true, phone: true, timezone: true },
      orderBy: [orderBy, { id: 'asc' }],
      ...pagination(query),
    }),
    prisma.branch.count({ where }),
  ]);
  return pageResult(items, totalItems, query);
}

const publicVariantSelect = {
  id: true,
  variantCode: true,
  modelId: true,
  sizeCode: true,
  colorCode: true,
  editionLabel: true,
  fitNotes: true,
  dailyRentalPriceVnd: true,
  depositAmountVnd: true,
  model: {
    select: {
      id: true,
      modelCode: true,
      name: true,
      shortDescription: true,
      description: true,
      material: true,
      category: { select: { id: true, name: true } },
      media: {
        orderBy: { sortOrder: 'asc' as const },
        select: { id: true, objectKey: true, sortOrder: true, altText: true },
      },
    },
  },
  media: {
    orderBy: { sortOrder: 'asc' as const },
    select: { id: true, objectKey: true, sortOrder: true, altText: true },
  },
} satisfies Prisma.CostumeVariantSelect;

export async function listPublicVariants(query: PublicCatalogListInput) {
  const where: Prisma.CostumeVariantWhereInput = {
    status: 'ACTIVE',
    model: { is: { status: 'ACTIVE', category: { is: { status: 'ACTIVE' } } } },
    ...(query.modelId ? { modelId: query.modelId } : {}),
    ...(query.categoryId ? { model: { is: { categoryId: query.categoryId, status: 'ACTIVE', category: { is: { status: 'ACTIVE' } } } } } : {}),
    ...(query.sizeCode ? { sizeCode: query.sizeCode } : {}),
    ...(query.colorCode ? { colorCode: query.colorCode } : {}),
    ...(query.search
      ? {
          OR: [
            { variantCode: { contains: query.search, mode: 'insensitive' } },
            { sizeCode: { contains: query.search, mode: 'insensitive' } },
            { colorCode: { contains: query.search, mode: 'insensitive' } },
            { model: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  };
  const sortField = ['createdAt', 'updatedAt', 'variantCode', 'sizeCode', 'colorCode'].includes(
    query.sortBy,
  )
    ? query.sortBy
    : 'createdAt';
  const [items, totalItems] = await prisma.$transaction([
    prisma.costumeVariant.findMany({
      where,
      select: publicVariantSelect,
      orderBy: [{ [sortField]: query.sortOrder }, { id: 'asc' }],
      ...pagination(query),
    }),
    prisma.costumeVariant.count({ where }),
  ]);
  return pageResult(
    items.map((item) => ({
      ...item,
      model: {
        ...item.model,
        media: item.model.media.map(({ objectKey, ...media }) => ({
          ...media,
          mediaUrl: publicObjectUrl(objectKey),
        })),
      },
      media: item.media.map(({ objectKey, ...media }) => ({
        ...media,
        mediaUrl: publicObjectUrl(objectKey),
      })),
    })),
    totalItems,
    query,
  );
}

export async function getPublicVariant(id: string) {
  const item = await prisma.costumeVariant.findFirst({
    where: {
      id,
      status: 'ACTIVE',
      model: { is: { status: 'ACTIVE', category: { is: { status: 'ACTIVE' } } } },
    },
    select: publicVariantSelect,
  });
  if (!item) throw new AppError(404, 'VARIANT_NOT_FOUND', 'Variant not found');
  return {
    ...item,
    model: {
      ...item.model,
      media: item.model.media.map(({ objectKey, ...media }) => ({
        ...media,
        mediaUrl: publicObjectUrl(objectKey),
      })),
    },
    media: item.media.map(({ objectKey, ...media }) => ({
      ...media,
      mediaUrl: publicObjectUrl(objectKey),
    })),
  };
}

/**
 * Return only an availability summary for public booking. Physical unit ids
 * stay private; staff use the protected availability endpoint when assigning
 * a concrete unit to an order.
 */
export async function checkPublicAvailability(input: PublicAvailabilityInput) {
  const now = new Date();
  const [branch, variant, policy] = await prisma.$transaction([
    prisma.branch.findFirst({ where: { id: input.pickupBranchId, status: 'ACTIVE' }, select: { id: true } }),
    prisma.costumeVariant.findFirst({
      where: {
        id: input.variantId,
        status: 'ACTIVE',
        model: { is: { status: 'ACTIVE', category: { is: { status: 'ACTIVE' } } } },
      },
      select: { id: true, cleaningBufferMinutes: true },
    }),
    prisma.rentalPolicyVersion.findFirst({
      where: {
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      orderBy: { effectiveFrom: 'desc' },
      select: { lateReturnBufferMinutes: true },
    }),
  ]);
  if (!branch) throw new AppError(404, 'BRANCH_NOT_FOUND', 'Branch not found');
  if (!variant) throw new AppError(404, 'VARIANT_NOT_FOUND', 'Variant not found');
  if (!policy) throw new AppError(404, 'POLICY_NOT_FOUND', 'No active rental policy');
  const protectedUntil = new Date(
    input.plannedDueAt.getTime() +
      Math.max(policy.lateReturnBufferMinutes, variant.cleaningBufferMinutes ?? 0) * 60_000,
  );

  const availableUnits = await prisma.costumeUnit.count({
    where: {
      variantId: input.variantId,
      currentBranchId: input.pickupBranchId,
      operationalStatus: 'READY',
      orderItems: {
        none: {
          OR: [
            {
              order: {
                status: { in: ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'ACTIVE', 'RETURN_INSPECTION'] },
              },
              occupiedFrom: { lt: protectedUntil },
              occupiedUntil: { gt: input.plannedStartAt },
            },
            {
              allocationStatus: 'ACTIVE',
              order: { status: { in: ['ACTIVE', 'RETURN_INSPECTION'] } },
            },
          ],
        },
      },
      blocks: {
        none: {
          status: { in: ['PLANNED', 'IN_PROGRESS'] },
          blockedFrom: { lt: protectedUntil },
          blockedUntil: { gt: input.plannedStartAt },
        },
      },
      transferItems: {
        none: { transfer: { status: { in: ['REQUESTED', 'APPROVED', 'IN_TRANSIT'] } } },
      },
    },
  });
  return { variantId: input.variantId, pickupBranchId: input.pickupBranchId, available: availableUnits > 0, availableUnits };
}
