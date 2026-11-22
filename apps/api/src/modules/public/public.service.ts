import { AppError } from '../../common/errors/app-error.js';
import { pageResult, pagination } from '../../common/http/query.js';
import { publicObjectUrl } from '../../common/storage/s3.js';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  PublicAvailabilityBatchInput,
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
      select: {
        id: true,
        branchCode: true,
        name: true,
        address: true,
        phone: true,
        timezone: true,
      },
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
    ...(query.categoryId
      ? {
          model: {
            is: {
              categoryId: query.categoryId,
              status: 'ACTIVE',
              category: { is: { status: 'ACTIVE' } },
            },
          },
        }
      : {}),
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
  const modelIds = [...new Set(items.map((item) => item.model.id))];
  const modelVariantIds = modelIds.length
    ? await prisma.costumeVariant.findMany({
        where: { modelId: { in: modelIds } },
        select: { id: true, modelId: true },
      })
    : [];
  const reviewGroups = modelVariantIds.length
    ? await prisma.rentalReview.groupBy({
        by: ['variantId'],
        where: {
          status: 'PUBLISHED',
          variantId: { in: modelVariantIds.map((variant) => variant.id) },
        },
        _sum: { stars: true },
        _count: { _all: true },
      })
    : [];
  const modelByVariant = new Map(modelVariantIds.map((variant) => [variant.id, variant.modelId]));
  const summaries = new Map<string, { total: number; count: number }>();
  reviewGroups.forEach((group) => {
    const modelId = modelByVariant.get(group.variantId);
    if (!modelId) return;
    const current = summaries.get(modelId) ?? { total: 0, count: 0 };
    current.total += group._sum.stars ?? 0;
    current.count += group._count._all;
    summaries.set(modelId, current);
  });
  return pageResult(
    items.map((item) => ({
      ...item,
      model: {
        ...item.model,
        reviewSummary: (() => {
          const summary = summaries.get(item.model.id);
          return {
            average: summary ? summary.total / summary.count : 0,
            count: summary?.count ?? 0,
          };
        })(),
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
  const reviewSummary = await prisma.rentalReview.aggregate({
    where: { status: 'PUBLISHED', variant: { modelId: item.model.id } },
    _avg: { stars: true },
    _count: { _all: true },
  });
  return {
    ...item,
    model: {
      ...item.model,
      reviewSummary: { average: reviewSummary._avg.stars ?? 0, count: reviewSummary._count._all },
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
  const [result] = await checkPublicAvailabilityBatch({
    variantIds: [input.variantId],
    pickupBranchId: input.pickupBranchId,
    plannedStartAt: input.plannedStartAt,
    plannedDueAt: input.plannedDueAt,
  });
  return result;
}

/** One request checks the visible variants using one branch/policy lookup. */
export async function checkPublicAvailabilityBatch(input: PublicAvailabilityBatchInput) {
  const now = new Date();
  const variantIds = [...new Set(input.variantIds)];
  const [branch, variants, policy] = await prisma.$transaction([
    prisma.branch.findFirst({
      where: { id: input.pickupBranchId, status: 'ACTIVE' },
      select: { id: true },
    }),
    prisma.costumeVariant.findMany({
      where: {
        id: { in: variantIds },
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
      select: { lateReturnBufferMinutes: true, defaultCleaningBufferMinutes: true },
    }),
  ]);
  if (!branch) throw new AppError(404, 'BRANCH_NOT_FOUND', 'Branch not found');
  if (variants.length !== variantIds.length)
    throw new AppError(404, 'VARIANT_NOT_FOUND', 'Variant not found');
  if (!policy) throw new AppError(404, 'POLICY_NOT_FOUND', 'No active rental policy');
  const countFor = (variant: (typeof variants)[number]) => {
    const protectedUntil = new Date(
      input.plannedDueAt.getTime() +
        (Math.max(0, policy.lateReturnBufferMinutes) +
          Math.max(0, variant.cleaningBufferMinutes ?? policy.defaultCleaningBufferMinutes)) *
          60_000,
    );
    return prisma.costumeUnit.count({
      where: {
        variantId: variant.id,
        currentBranchId: input.pickupBranchId,
        operationalStatus: 'READY',
        orderItems: {
          none: {
            OR: [
              {
                order: {
                  status: {
                    in: [
                      'CONFIRMED',
                      'PREPARING',
                      'READY_FOR_PICKUP',
                      'ACTIVE',
                      'RETURN_INSPECTION',
                    ],
                  },
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
  };
  const counts: number[] = [];
  for (let offset = 0; offset < variants.length; offset += 10)
    counts.push(...(await Promise.all(variants.slice(offset, offset + 10).map(countFor))));
  const countById = new Map(variants.map((variant, index) => [variant.id, counts[index]]));
  return variantIds.map((variantId) => {
    const availableUnits = countById.get(variantId) ?? 0;
    return {
      variantId,
      pickupBranchId: input.pickupBranchId,
      available: availableUnits > 0,
      availableUnits,
    };
  });
}
