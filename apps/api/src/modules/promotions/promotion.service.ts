import { AppError } from '../../common/errors/app-error.js';
import { pageResult, pagination } from '../../common/http/query.js';
import { prisma } from '../../database/prisma.js';
import { assertPermission, type AuthenticatedActor } from '../auth/authorization.js';
import type { PromotionInput } from './promotion.schema.js';

export async function listPromotions(
  actor: AuthenticatedActor,
  query: { page: number; pageSize: number; search?: string; isActive?: boolean },
) {
  assertPermission(actor, { module: 'promotions', action: 'read' });
  const where = {
    ...(query.search
      ? {
          OR: [
            { code: { contains: query.search, mode: 'insensitive' as const } },
            { name: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
  };
  const [items, totalItems] = await prisma.$transaction([
    prisma.promotion.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...pagination(query as never),
    }),
    prisma.promotion.count({ where }),
  ]);
  return pageResult(items, totalItems, query as never);
}
export async function createPromotion(actor: AuthenticatedActor, input: PromotionInput) {
  assertPermission(actor, { module: 'promotions', action: 'manage' });
  try {
    return await prisma.promotion.create({
      data: { ...input, code: input.code.toUpperCase(), createdBy: actor.id },
    });
  } catch (error) {
    if (isUnique(error))
      throw new AppError(409, 'PROMOTION_CODE_CONFLICT', 'Promotion code already exists');
    throw error;
  }
}
export async function updatePromotion(
  actor: AuthenticatedActor,
  id: string,
  input: Partial<PromotionInput>,
) {
  assertPermission(actor, { module: 'promotions', action: 'manage' });
  const existing = await prisma.promotion.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'PROMOTION_NOT_FOUND', 'Promotion not found');
  const startAt = input.startAt ?? existing.startAt;
  const endAt = input.endAt ?? existing.endAt;
  const discountType = input.discountType ?? existing.discountType;
  const discountValue = input.discountValue ?? existing.discountValue;
  if (endAt <= startAt)
    throw new AppError(400, 'INVALID_PROMOTION_RANGE', 'endAt must be after startAt');
  if (discountType === 'PERCENT' && discountValue > 100n)
    throw new AppError(400, 'INVALID_DISCOUNT', 'Percent discount must be <= 100');
  const used = await prisma.rentalOrder.count({ where: { promotionId: id } });
  if (
    used > 0 &&
    (input.code ||
      input.discountType ||
      input.discountValue !== undefined ||
      input.minOrderAmountVnd !== undefined)
  )
    throw new AppError(
      409,
      'PROMOTION_IMMUTABLE',
      'Used promotion pricing fields cannot be changed',
    );
  return prisma.promotion.update({ where: { id }, data: input });
}
export async function setPromotionStatus(actor: AuthenticatedActor, id: string, isActive: boolean) {
  assertPermission(actor, { module: 'promotions', action: 'manage' });
  const item = await prisma.promotion.findUnique({ where: { id } });
  if (!item) throw new AppError(404, 'PROMOTION_NOT_FOUND', 'Promotion not found');
  if (isActive && item.endAt <= new Date())
    throw new AppError(409, 'PROMOTION_EXPIRED', 'Expired promotion cannot be activated');
  return prisma.promotion.update({ where: { id }, data: { isActive } });
}
function isUnique(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
