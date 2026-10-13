import { randomUUID } from 'node:crypto';

import { AppError } from '../../common/errors/app-error.js';
import { pageResult, pagination } from '../../common/http/query.js';
import { promoteStoredImage } from '../../common/storage/s3.js';
import { env } from '../../config/env.js';
import { prisma } from '../../database/prisma.js';
import { Prisma, type OrderStatus } from '../../generated/prisma/client.js';
import {
  assertPermission,
  hasPermission,
  requireActor,
  type AuthenticatedActor,
} from '../auth/authorization.js';
import { lockActiveBranch } from '../branches/branch.service.js';
import {
  damageDueVnd,
  depositDueVnd,
  rentalDueBeforeExtensionsVnd,
  successfulPaymentTotal,
} from './rental-financials.js';
import type {
  CompleteInput,
  AssessmentInput,
  DebtListInput,
  AmendOrderItemInput,
  ConfirmInput,
  CreateOrderInput,
  QuoteInput,
  ExtendOrderInput,
  ListOrdersInput,
  PickupInput,
  ReallocateInput,
  ReturnInput,
  UpdateOrderInput,
} from './rental.schema.js';

const transactionOptions = { maxWait: 10_000, timeout: 20_000 } as const;
const occupiedStatuses = [
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'ACTIVE',
  'RETURN_INSPECTION',
] satisfies OrderStatus[];
const mutableStatus: OrderStatus = 'PENDING_CONFIRMATION';

function includeOrder() {
  return {
    customer: {
      include: { user: { select: { id: true, displayName: true, email: true, phone: true } } },
    },
    pickupBranch: true,
    policyVersion: true,
    promotion: true,
    items: {
      include: {
        variant: { include: { model: { include: { category: true } } } },
        unit: true,
        accessories: true,
        evidence: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    },
    payments: { include: { refunds: true }, orderBy: { createdAt: 'asc' } },
  } satisfies Prisma.RentalOrderInclude;
}

function orderCode() {
  return `ORD-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
}
function assertVersion(current: number, expected: number) {
  if (current !== expected)
    throw new AppError(409, 'ORDER_VERSION_CONFLICT', 'Order was changed by another request');
}
function assertStatus(current: OrderStatus, expected: readonly OrderStatus[]) {
  if (!expected.includes(current))
    throw new AppError(409, 'INVALID_ORDER_TRANSITION', 'Order status transition is not allowed');
}
function requireEmployee(actor: AuthenticatedActor) {
  requireActor(actor);
  if (!actor.employee)
    throw new AppError(403, 'EMPLOYEE_REQUIRED', 'A current employee account is required');
  return actor;
}
function canOwn(actor: AuthenticatedActor, action: 'read' | 'manage', customerUserId: string) {
  return (
    actor.id === customerUserId && hasPermission(actor, { module: 'rentals', action, scope: 'OWN' })
  );
}
function canBranch(actor: AuthenticatedActor, action: 'read' | 'manage', branchId: string) {
  return hasPermission(actor, { module: 'rentals', action, branchId });
}
function assertRead(
  actor: AuthenticatedActor,
  order: { customerUserId: string; pickupBranchId: string },
) {
  if (
    !canOwn(actor, 'read', order.customerUserId) &&
    !canBranch(actor, 'read', order.pickupBranchId)
  )
    throw new AppError(403, 'FORBIDDEN', 'Permission denied for this rental order');
}
function assertManage(
  actor: AuthenticatedActor,
  order: { customerUserId: string; pickupBranchId: string },
) {
  if (
    !canOwn(actor, 'manage', order.customerUserId) &&
    !canBranch(actor, 'manage', order.pickupBranchId)
  )
    throw new AppError(403, 'FORBIDDEN', 'Permission denied for this rental order');
}
function assertRentalAction(
  actor: AuthenticatedActor,
  order: { customerUserId: string; pickupBranchId: string },
  action: 'confirm' | 'prepare' | 'handover' | 'return' | 'assessment' | 'settlement',
) {
  requireEmployee(actor);
  if (
    !hasPermission(actor, { module: 'rentals', action, branchId: order.pickupBranchId }) &&
    !hasPermission(actor, { module: 'rentals', action: 'manage', branchId: order.pickupBranchId })
  )
    throw new AppError(403, 'FORBIDDEN', `Permission denied for rental ${action}`);
}

async function lockOrder(tx: Prisma.TransactionClient, id: string) {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM rental_orders WHERE id = ${id}::uuid FOR UPDATE`;
  if (!rows.length) throw new AppError(404, 'RENTAL_ORDER_NOT_FOUND', 'Rental order not found');
  return tx.rentalOrder.findUniqueOrThrow({ where: { id }, include: includeOrder() });
}
async function lockUnits(tx: Prisma.TransactionClient, ids: string[]) {
  const sorted = [...new Set(ids)].sort();
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM costume_units WHERE id IN (${Prisma.join(sorted.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`;
  if (rows.length !== sorted.length)
    throw new AppError(404, 'UNIT_NOT_FOUND', 'One or more costume units were not found');
  return tx.costumeUnit.findMany({
    where: { id: { in: sorted } },
    include: { variant: { include: { model: { include: { category: true } } } } },
  });
}
async function currentPolicy(tx: Prisma.TransactionClient, at = new Date()) {
  const policy = await tx.rentalPolicyVersion.findFirst({
    where: { effectiveFrom: { lte: at }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }] },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (!policy) throw new AppError(404, 'POLICY_NOT_FOUND', 'No active rental policy');
  return policy;
}
function billableDays(start: Date, due: Date, mode: string) {
  const hours = (due.getTime() - start.getTime()) / 3_600_000;
  return mode === 'CALENDAR_DAY'
    ? Math.max(
        1,
        Math.ceil(
          (Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate()) -
            Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())) /
            86_400_000,
        ),
      )
    : Math.max(1, Math.ceil(hours / 24));
}
export function bookingReservationUntil(
  plannedDueAt: Date,
  lateReturnBufferMinutes: number,
  cleaningBufferMinutes: number | null = 0,
) {
  // Use the greater value so the operational preparation window is not counted twice.
  const bufferMinutes = Math.max(0, lateReturnBufferMinutes, cleaningBufferMinutes ?? 0);
  return new Date(plannedDueAt.getTime() + bufferMinutes * 60_000);
}

interface LateFeeItem {
  id: string;
  unitDailyPriceVnd: bigint;
  billableDays: number;
}

export function calculateItemLateFees(
  items: LateFeeItem[],
  returnedItemIds: string[],
  plannedDueAt: Date,
  returnedAt: Date,
  lateGraceMinutes: number,
  feePercentPerDay: number,
  promotionDiscountVnd = 0n,
) {
  const totalBase = items.reduce(
    (sum, item) => sum + item.unitDailyPriceVnd * BigInt(item.billableDays),
    0n,
  );
  const discount = promotionDiscountVnd < 0n
    ? 0n
    : promotionDiscountVnd > totalBase
      ? totalBase
      : promotionDiscountVnd;
  const itemBases = items.map((item) => item.unitDailyPriceVnd * BigInt(item.billableDays));
  const discounts = itemBases.map((base) => (totalBase > 0n ? (discount * base) / totalBase : 0n));
  let undistributedDiscount = discount - discounts.reduce((sum, value) => sum + value, 0n);
  for (let index = 0; index < discounts.length && undistributedDiscount > 0n; index += 1) {
    const remainingCapacity = itemBases[index]! - discounts[index]!;
    const allocation = remainingCapacity < undistributedDiscount ? remainingCapacity : undistributedDiscount;
    discounts[index] = discounts[index]! + allocation;
    undistributedDiscount -= allocation;
  }
  const bases = items.map((item, index) => ({
    item,
    baseVnd: itemBases[index]! - discounts[index]!,
  }));
  const graceEnd = plannedDueAt.getTime() + Math.max(0, lateGraceMinutes) * 60_000;
  const lateDays =
    returnedAt.getTime() <= graceEnd
      ? 0
      : Math.ceil((returnedAt.getTime() - graceEnd) / 86_400_000);
  const rateBasisPoints = BigInt(Math.round(Math.min(100, Math.max(0, feePercentPerDay)) * 100));
  const returned = new Set(returnedItemIds);
  const chargedItems = bases
    .filter(({ item }) => returned.has(item.id))
    .map(({ item, baseVnd }) => {
      let feeVnd =
        lateDays > 0 && rateBasisPoints > 0n
          ? (baseVnd * rateBasisPoints * BigInt(lateDays)) / 10_000n
          : 0n;
      if (feeVnd > baseVnd) feeVnd = baseVnd;
      return { orderItemId: item.id, baseRentalVnd: baseVnd, lateDays, lateFeeVnd: feeVnd };
    });
  return {
    lateDays,
    lateFeeVnd: chargedItems.reduce((sum, item) => sum + item.lateFeeVnd, 0n),
    items: chargedItems.map((item) => ({
      orderItemId: item.orderItemId,
      baseRentalVnd: item.baseRentalVnd.toString(),
      lateDays: item.lateDays,
      lateFeeVnd: item.lateFeeVnd.toString(),
    })),
  };
}

export function calculateLegacyLateFee(
  items: LateFeeItem[],
  plannedDueAt: Date,
  returnedAt: Date,
  lateGraceMinutes: number,
  feePercentPerDay: number,
) {
  const graceEnd = plannedDueAt.getTime() + Math.max(0, lateGraceMinutes) * 60_000;
  const lateDays =
    returnedAt.getTime() <= graceEnd
      ? 0
      : Math.ceil((returnedAt.getTime() - graceEnd) / 86_400_000);
  const rentalBase = items.reduce(
    (sum, item) => sum + item.unitDailyPriceVnd * BigInt(item.billableDays),
    0n,
  );
  const lateFeeVnd = lateDays
    ? (rentalBase * BigInt(Math.trunc(Number(feePercentPerDay) * 100)) * BigInt(lateDays)) / 10_000n
    : 0n;
  return { lateDays, lateFeeVnd };
}

async function assertUnitAvailableForPeriod(
  tx: Prisma.TransactionClient,
  unitId: string,
  occupiedFrom: Date,
  occupiedUntil: Date,
  excludedItemId: string,
) {
  const [overlap, blocked, transfer, activeAllocation] = await Promise.all([
    tx.rentalOrderItem.findFirst({
      where: {
        unitId,
        id: { not: excludedItemId },
        order: { status: { in: occupiedStatuses } },
        occupiedFrom: { lt: occupiedUntil },
        occupiedUntil: { gt: occupiedFrom },
      },
      select: { id: true },
    }),
    tx.unitBlock.findFirst({
      where: {
        unitId,
        status: { in: ['PLANNED', 'IN_PROGRESS'] },
        blockedFrom: { lt: occupiedUntil },
        blockedUntil: { gt: occupiedFrom },
      },
      select: { id: true },
    }),
    tx.stockTransferItem.findFirst({
      where: { unitId, transfer: { status: { in: ['REQUESTED', 'APPROVED', 'IN_TRANSIT'] } } },
      select: { id: true },
    }),
    tx.rentalOrderItem.findFirst({
      where: {
        unitId,
        id: { not: excludedItemId },
        allocationStatus: 'ACTIVE',
        order: { status: { in: ['ACTIVE', 'RETURN_INSPECTION'] } },
      },
      select: { id: true },
    }),
  ]);
  if (overlap || blocked || transfer || activeAllocation)
    throw new AppError(409, 'UNIT_UNAVAILABLE', 'Unit is already reserved or unavailable');
}
async function pricedItems(tx: Prisma.TransactionClient, input: CreateOrderInput) {
  const ids = input.items.map((item) => item.variantId);
  if (new Set(ids).size !== ids.length)
    throw new AppError(400, 'DUPLICATE_VARIANT', 'Each variant may appear only once per order');
  const variants = await tx.costumeVariant.findMany({
    where: { id: { in: ids } },
    include: { model: { include: { category: true, accessories: { where: { isActive: true } } } } },
  });
  if (variants.length !== ids.length)
    throw new AppError(404, 'VARIANT_NOT_FOUND', 'One or more variants were not found');
  if (
    variants.some(
      (v) =>
        v.status !== 'ACTIVE' ||
        v.model.status !== 'ACTIVE' ||
        v.model.category.status !== 'ACTIVE',
    )
  )
    throw new AppError(409, 'VARIANT_INACTIVE', 'Every variant and its hierarchy must be active');
  const policy = await currentPolicy(tx);
  const days = billableDays(input.plannedStartAt, input.plannedDueAt, policy.billingDayMode);
  if (days < policy.minRentalDays || (policy.maxRentalDays && days > policy.maxRentalDays))
    throw new AppError(400, 'INVALID_RENTAL_PERIOD', 'Rental duration violates the active policy');
  return { policy, days, variants };
}

async function availabilityForQuote(
  tx: Prisma.TransactionClient,
  input: QuoteInput,
  variants: Awaited<ReturnType<typeof pricedItems>>['variants'],
  lateReturnBufferMinutes: number,
) {
  const rows = await Promise.all(
    variants.map(async (variant) => {
      const protectedUntil = bookingReservationUntil(
        input.plannedDueAt,
        lateReturnBufferMinutes,
        variant.cleaningBufferMinutes,
      );
      const availableUnits = await tx.costumeUnit.count({
        where: {
          variantId: variant.id,
          currentBranchId: input.pickupBranchId,
          operationalStatus: 'READY',
          orderItems: {
            none: {
              OR: [
                {
                  order: { status: { in: occupiedStatuses } },
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
      return { variantId: variant.id, availableUnits };
    }),
  );
  return rows;
}

export async function createQuote(actor: AuthenticatedActor, input: QuoteInput) {
  requireActor(actor);
  if (actor.id !== input.customerUserId) {
    requireEmployee(actor);
    assertPermission(actor, {
      module: 'rentals',
      action: 'manage',
      branchId: input.pickupBranchId,
    });
  } else assertPermission(actor, { module: 'rentals', action: 'manage', scope: 'OWN' });

  return prisma.$transaction(async (tx) => {
    await lockActiveBranch(tx, input.pickupBranchId);
    const customer = await tx.customer.findUnique({
      where: { userId: input.customerUserId },
      select: { userId: true },
    });
    if (!customer) throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found');
    const { policy, days, variants } = await pricedItems(tx, input);
    const subtotalVnd = variants.reduce(
      (total, variant) => total + variant.dailyRentalPriceVnd * BigInt(days),
      0n,
    );
    const { promotion, discount } = await resolvePromotion(
      tx,
      input,
      input.customerUserId,
      subtotalVnd,
    );
    const depositVnd = variants.reduce((total, variant) => total + variant.depositAmountVnd, 0n);
    const availability = await availabilityForQuote(
      tx,
      input,
      variants,
      policy.lateReturnBufferMinutes,
    );
    return {
      quoteExpiresAt: new Date(Date.now() + policy.quoteValidHours * 3_600_000),
      policy: {
        id: policy.id,
        versionCode: policy.versionCode,
        billingDayMode: policy.billingDayMode,
        minRentalDays: policy.minRentalDays,
        maxRentalDays: policy.maxRentalDays,
        quoteValidHours: policy.quoteValidHours,
        lateGraceMinutes: policy.lateGraceMinutes,
        lateFeePercentPerDay: Number(policy.lateFeePercentPerDay),
      },
      period: {
        plannedStartAt: input.plannedStartAt,
        plannedDueAt: input.plannedDueAt,
        billableDays: days,
      },
      items: variants.map((variant) => ({
        variantId: variant.id,
        variantCode: variant.variantCode,
        modelId: variant.modelId,
        dailyRentalPriceVnd: variant.dailyRentalPriceVnd,
        depositAmountVnd: variant.depositAmountVnd,
        rentalAmountVnd: variant.dailyRentalPriceVnd * BigInt(days),
        availableUnits: availability.find((item) => item.variantId === variant.id)?.availableUnits ?? 0,
      })),
      promotion: promotion
        ? { id: promotion.id, code: promotion.code, discountVnd: discount }
        : null,
      subtotalVnd,
      discountVnd: discount,
      rentalAmountVnd: subtotalVnd - discount,
      depositVnd,
      totalDueVnd: subtotalVnd - discount + depositVnd,
      available: availability.every((item) => item.availableUnits > 0),
    };
  }, transactionOptions);
}
async function resolvePromotion(
  tx: Prisma.TransactionClient,
  input: CreateOrderInput,
  customerUserId: string,
  subtotal: bigint,
) {
  if (!input.promotionCode) return { promotion: null, discount: 0n };
  const promotion = await tx.promotion.findUnique({
    where: { code: input.promotionCode.toUpperCase() },
  });
  const now = new Date();
  if (
    !promotion ||
    !promotion.isActive ||
    promotion.startAt > now ||
    promotion.endAt <= now ||
    subtotal < promotion.minOrderAmountVnd
  )
    throw new AppError(409, 'PROMOTION_INVALID', 'Promotion is invalid for this order');
  await tx.$queryRaw`SELECT id FROM promotions WHERE id = ${promotion.id}::uuid FOR UPDATE`;
  const used = await tx.rentalOrder.count({
    where: {
      promotionId: promotion.id,
      customerUserId,
      status: { notIn: ['REJECTED', 'CANCELLED'] },
    },
  });
  if (used >= promotion.perCustomerLimit)
    throw new AppError(409, 'PROMOTION_LIMIT_REACHED', 'Promotion usage limit reached');
  const totalUsed = await tx.rentalOrder.count({
    where: { promotionId: promotion.id, status: { notIn: ['REJECTED', 'CANCELLED'] } },
  });
  if (promotion.totalUsageLimit !== null && totalUsed >= promotion.totalUsageLimit)
    throw new AppError(409, 'PROMOTION_LIMIT_REACHED', 'Promotion usage limit reached');
  let discount =
    promotion.discountType === 'PERCENT'
      ? (subtotal * promotion.discountValue) / 100n
      : promotion.discountValue;
  if (promotion.maxDiscountVnd !== null && discount > promotion.maxDiscountVnd)
    discount = promotion.maxDiscountVnd;
  return { promotion, discount: discount > subtotal ? subtotal : discount };
}
function itemCreateData(
  input: CreateOrderInput,
  variants: Awaited<ReturnType<typeof pricedItems>>['variants'],
  days: number,
  lateReturnBufferMinutes: number,
) {
  return input.items.map((item) => {
    const variant = variants.find((v) => v.id === item.variantId)!;
    const active = new Map(variant.model.accessories.map((a) => [a.id, a]));
    if (new Set(item.accessories.map((a) => a.modelAccessoryId)).size !== item.accessories.length)
      throw new AppError(400, 'DUPLICATE_ACCESSORY', 'Accessories must be unique per item');
    return {
      variantId: variant.id,
      occupiedFrom: input.plannedStartAt,
      occupiedUntil: bookingReservationUntil(
        input.plannedDueAt,
        lateReturnBufferMinutes,
        variant.cleaningBufferMinutes,
      ),
      billableDays: days,
      unitDailyPriceVnd: variant.dailyRentalPriceVnd,
      unitDepositVnd: variant.depositAmountVnd,
      accessories: {
        create: item.accessories.map((a) => {
          const accessory = active.get(a.modelAccessoryId);
          if (!accessory)
            throw new AppError(
              400,
              'INVALID_ACCESSORY',
              'Accessory does not belong to the selected model',
            );
          return {
            modelAccessoryId: accessory.id,
            accessoryName: accessory.name,
            quantityOut: a.quantity,
            unitReplacementValueVnd: accessory.replacementValueVnd ?? 0n,
          };
        }),
      },
    };
  });
}
async function addEvent(
  tx: Prisma.TransactionClient,
  orderId: string,
  eventType: string,
  actorId: string,
  fromStatus?: OrderStatus,
  toStatus?: OrderStatus,
  metadataJson?: Prisma.InputJsonValue,
) {
  await tx.rentalOrderEvent.create({
    data: { orderId, eventType, actorUserId: actorId, fromStatus, toStatus, metadataJson },
  });
}

export async function listOrders(actor: AuthenticatedActor, query: ListOrdersInput) {
  requireActor(actor);
  const global = hasPermission(actor, { module: 'rentals', action: 'read' });
  const branches = actor.roleAssignments.flatMap((a) =>
    a.branchId &&
    a.role.isActive &&
    a.branch?.status === 'ACTIVE' &&
    a.role.rolePermissions.some(
      ({ permission }) =>
        permission.module === 'rentals' &&
        permission.action === 'read' &&
        permission.scope === 'BRANCH',
    )
      ? [a.branchId]
      : [],
  );
  const own = hasPermission(actor, { module: 'rentals', action: 'read', scope: 'OWN' });
  if (!global && !branches.length && !own)
    assertPermission(actor, { module: 'rentals', action: 'read' });
  const visibility: Prisma.RentalOrderWhereInput = global
    ? {}
    : {
        OR: [
          ...(own ? [{ customerUserId: actor.id }] : []),
          ...(branches.length ? [{ pickupBranchId: { in: branches } }] : []),
        ],
      };
  const where: Prisma.RentalOrderWhereInput = {
    ...visibility,
    ...(query.search ? { orderCode: { contains: query.search, mode: 'insensitive' } } : {}),
    ...(query.customerUserId ? { customerUserId: query.customerUserId } : {}),
    ...(query.pickupBranchId ? { pickupBranchId: query.pickupBranchId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.plannedFrom || query.plannedTo
      ? {
          plannedStartAt: {
            ...(query.plannedFrom ? { gte: query.plannedFrom } : {}),
            ...(query.plannedTo ? { lte: query.plannedTo } : {}),
          },
        }
      : {}),
  };
  const orderBy: Prisma.RentalOrderOrderByWithRelationInput = { [query.sortBy]: query.sortOrder };
  const [items, totalItems] = await prisma.$transaction([
    prisma.rentalOrder.findMany({
      where,
      include: includeOrder(),
      orderBy: [orderBy, { id: 'asc' }],
      ...pagination(query),
    }),
    prisma.rentalOrder.count({ where }),
  ]);
  return pageResult(items, totalItems, query);
}
export async function getOrder(actor: AuthenticatedActor, id: string) {
  const order = await prisma.rentalOrder.findUnique({ where: { id }, include: includeOrder() });
  if (!order) throw new AppError(404, 'RENTAL_ORDER_NOT_FOUND', 'Rental order not found');
  assertRead(actor, order);
  return order;
}
export async function checkAvailability(
  actor: AuthenticatedActor,
  input: { variantId: string; pickupBranchId: string; plannedStartAt: Date; plannedDueAt: Date },
) {
  requireActor(actor);
  if (
    !canBranch(actor, 'read', input.pickupBranchId) &&
    !hasPermission(actor, { module: 'rentals', action: 'manage', scope: 'OWN' })
  )
    throw new AppError(403, 'FORBIDDEN', 'Permission denied for availability');
  return prisma.$transaction(async (tx) => {
    const [variant, policy] = await Promise.all([
      tx.costumeVariant.findUnique({
        where: { id: input.variantId },
        select: { id: true, cleaningBufferMinutes: true },
      }),
      currentPolicy(tx),
    ]);
    if (!variant) throw new AppError(404, 'VARIANT_NOT_FOUND', 'Variant not found');
    const protectedUntil = bookingReservationUntil(
      input.plannedDueAt,
      policy.lateReturnBufferMinutes,
      variant.cleaningBufferMinutes,
    );
    const units = await tx.costumeUnit.findMany({
      where: {
        variantId: input.variantId,
        currentBranchId: input.pickupBranchId,
        operationalStatus: 'READY',
        orderItems: {
          none: {
            OR: [
              {
                order: { status: { in: occupiedStatuses } },
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
      select: { id: true, unitCode: true, conditionGrade: true },
    });
    return { available: units.length > 0, units };
  }, transactionOptions);
}
export async function createOrder(actor: AuthenticatedActor, input: CreateOrderInput) {
  requireActor(actor);
  if (actor.id !== input.customerUserId) {
    requireEmployee(actor);
    assertPermission(actor, {
      module: 'rentals',
      action: 'manage',
      branchId: input.pickupBranchId,
    });
  } else assertPermission(actor, { module: 'rentals', action: 'manage', scope: 'OWN' });
  return prisma.$transaction(async (tx) => {
    await lockActiveBranch(tx, input.pickupBranchId);
    const customer = await tx.customer.findUnique({
      where: { userId: input.customerUserId },
      select: { userId: true },
    });
    if (!customer) throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found');
    const { policy, days, variants } = await pricedItems(tx, input);
    const subtotal = variants.reduce(
      (total, variant) => total + variant.dailyRentalPriceVnd * BigInt(days),
      0n,
    );
    const { promotion, discount } = await resolvePromotion(
      tx,
      input,
      input.customerUserId,
      subtotal,
    );
    const created = await tx.rentalOrder.create({
      data: {
        orderCode: orderCode(),
        customerUserId: input.customerUserId,
        pickupBranchId: input.pickupBranchId,
        channel: input.channel,
        plannedStartAt: input.plannedStartAt,
        plannedDueAt: input.plannedDueAt,
        customerNote: input.customerNote ?? null,
        status: mutableStatus,
        policyVersionId: policy.id,
        promotionId: promotion?.id,
        promotionCode: promotion?.code,
        promotionDiscountVnd: discount,
        quoteExpiresAt: new Date(Date.now() + policy.quoteValidHours * 3_600_000),
        createdBy: actor.id,
        items: { create: itemCreateData(input, variants, days, policy.lateReturnBufferMinutes) },
      },
      include: includeOrder(),
    });
    await addEvent(tx, created.id, 'ORDER_CREATED', actor.id, undefined, mutableStatus);
    return created;
  }, transactionOptions);
}
export async function updateOrder(actor: AuthenticatedActor, id: string, input: UpdateOrderInput) {
  requireActor(actor);
  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, id);
    assertManage(actor, order);
    assertStatus(order.status, [mutableStatus]);
    assertVersion(order.version, input.expectedVersion);
    if (input.customerUserId !== order.customerUserId)
      throw new AppError(
        400,
        'CUSTOMER_IMMUTABLE',
        'The customer cannot be changed after order creation',
      );
    if (actor.employee)
      assertPermission(actor, {
        module: 'rentals',
        action: 'manage',
        branchId: input.pickupBranchId,
      });
    await lockActiveBranch(tx, input.pickupBranchId);
    const { policy, days, variants } = await pricedItems(tx, input);
    const subtotal = variants.reduce(
      (total, variant) => total + variant.dailyRentalPriceVnd * BigInt(days),
      0n,
    );
    const { promotion, discount } = await resolvePromotion(
      tx,
      input,
      order.customerUserId,
      subtotal,
    );
    const updated = await tx.rentalOrder.update({
      where: { id },
      data: {
        pickupBranchId: input.pickupBranchId,
        channel: input.channel,
        plannedStartAt: input.plannedStartAt,
        plannedDueAt: input.plannedDueAt,
        customerNote: input.customerNote ?? null,
        policyVersionId: policy.id,
        promotionId: promotion?.id ?? null,
        promotionCode: promotion?.code ?? null,
        promotionDiscountVnd: discount,
        quoteExpiresAt: new Date(Date.now() + policy.quoteValidHours * 3_600_000),
        items: { deleteMany: {}, create: itemCreateData(input, variants, days, policy.lateReturnBufferMinutes) },
        version: { increment: 1 },
      },
      include: includeOrder(),
    });
    await addEvent(tx, id, 'ORDER_UPDATED', actor.id, mutableStatus, mutableStatus);
    return updated;
  }, transactionOptions);
}
async function assertAllocations(
  tx: Prisma.TransactionClient,
  order: Awaited<ReturnType<typeof lockOrder>>,
  allocations: ConfirmInput['allocations'],
) {
  const expected = order.items.map((item) => item.id).sort();
  const received = allocations.map((item) => item.orderItemId).sort();
  if (expected.length !== received.length || expected.some((v, i) => v !== received[i]))
    throw new AppError(
      400,
      'INVALID_ALLOCATION',
      'Every order item must be allocated exactly once',
    );
  if (new Set(allocations.map((allocation) => allocation.unitId)).size !== allocations.length)
    throw new AppError(400, 'INVALID_ALLOCATION', 'A physical unit may be allocated only once');
  const units = await lockUnits(
    tx,
    allocations.map((a) => a.unitId),
  );
  for (const allocation of allocations) {
    const item = order.items.find((x) => x.id === allocation.orderItemId)!;
    const unit = units.find((x) => x.id === allocation.unitId)!;
    if (
      unit.variantId !== item.variantId ||
      unit.currentBranchId !== order.pickupBranchId ||
      unit.operationalStatus !== 'READY'
    )
      throw new AppError(409, 'UNIT_UNAVAILABLE', 'Unit does not match an available order item');
    const overlap = await tx.rentalOrderItem.findFirst({
      where: {
        unitId: unit.id,
        id: { not: item.id },
        order: { status: { in: occupiedStatuses } },
        occupiedFrom: { lt: item.occupiedUntil },
        occupiedUntil: { gt: item.occupiedFrom },
      },
      select: { id: true },
    });
    const activeAllocation = await tx.rentalOrderItem.findFirst({
      where: {
        unitId: unit.id,
        id: { not: item.id },
        allocationStatus: 'ACTIVE',
        order: { status: { in: ['ACTIVE', 'RETURN_INSPECTION'] } },
      },
      select: { id: true },
    });
    const blocked = await tx.unitBlock.findFirst({
      where: {
        unitId: unit.id,
        status: { in: ['PLANNED', 'IN_PROGRESS'] },
        blockedFrom: { lt: item.occupiedUntil },
        blockedUntil: { gt: item.occupiedFrom },
      },
      select: { id: true },
    });
    const transfer = await tx.stockTransferItem.findFirst({
      where: {
        unitId: unit.id,
        transfer: { status: { in: ['REQUESTED', 'APPROVED', 'IN_TRANSIT'] } },
      },
      select: { id: true },
    });
    if (overlap || activeAllocation || blocked || transfer)
      throw new AppError(409, 'UNIT_UNAVAILABLE', 'Unit is already reserved or unavailable');
  }
}
export async function confirmOrder(actor: AuthenticatedActor, id: string, input: ConfirmInput) {
  requireEmployee(actor);
  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, id);
    assertRentalAction(actor, order, 'confirm');
    await lockActiveBranch(tx, order.pickupBranchId);
    assertStatus(order.status, [mutableStatus]);
    assertVersion(order.version, input.expectedVersion);
    if (order.quoteExpiresAt && order.quoteExpiresAt <= new Date())
      throw new AppError(409, 'QUOTE_EXPIRED', 'The order quote has expired and must be repriced');
    await assertAllocations(tx, order, input.allocations);
    for (const a of input.allocations)
      await tx.rentalOrderItem.update({
        where: { id: a.orderItemId },
        data: { unitId: a.unitId, allocationStatus: 'CONFIRMED', allocatedBy: actor.id },
      });
    const result = await tx.rentalOrder.update({
      where: { id },
      data: { status: 'CONFIRMED', version: { increment: 1 } },
      include: includeOrder(),
    });
    await addEvent(tx, id, 'ORDER_CONFIRMED', actor.id, mutableStatus, 'CONFIRMED');
    return result;
  }, transactionOptions);
}
export async function reallocateOrder(
  actor: AuthenticatedActor,
  id: string,
  input: ReallocateInput,
) {
  requireEmployee(actor);
  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, id);
    assertManage(actor, order);
    assertStatus(order.status, ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP']);
    assertVersion(order.version, input.expectedVersion);
    const previousItem = order.items.find((item) => item.id === input.orderItemId);
    if (!previousItem)
      throw new AppError(404, 'ORDER_ITEM_NOT_FOUND', 'Rental order item not found');
    await assertAllocations(
      tx,
      { ...order, items: order.items.filter((item) => item.id === input.orderItemId) },
      [{ orderItemId: input.orderItemId, unitId: input.unitId }],
    );
    const result = await tx.rentalOrder.update({
      where: { id },
      data: {
        items: {
          update: {
            where: { id: input.orderItemId },
            data: { unitId: input.unitId, allocationStatus: 'CONFIRMED', allocatedBy: actor.id },
          },
        },
        version: { increment: 1 },
      },
      include: includeOrder(),
    });
    await addEvent(tx, id, 'UNIT_REALLOCATED', actor.id, order.status, order.status, {
      orderItemId: input.orderItemId,
      previousUnitId: previousItem.unitId,
      newUnitId: input.unitId,
      variantId: previousItem.variantId,
      reason: input.reason,
    });
    return result;
  }, transactionOptions);
}
export async function extendOrder(actor: AuthenticatedActor, id: string, input: ExtendOrderInput) {
  requireEmployee(actor);
  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, id);
    assertManage(actor, order);
    assertStatus(order.status, ['ACTIVE']);
    assertVersion(order.version, input.expectedVersion);
    if (input.newDueAt <= order.plannedDueAt)
      throw new AppError(
        400,
        'INVALID_EXTENSION_PERIOD',
        'newDueAt must be after the current due date',
      );
    const totalDays = billableDays(
      order.plannedStartAt,
      input.newDueAt,
      order.policyVersion.billingDayMode,
    );
    if (order.policyVersion.maxRentalDays && totalDays > order.policyVersion.maxRentalDays)
      throw new AppError(
        400,
        'INVALID_RENTAL_PERIOD',
        'Extension exceeds the maximum rental duration',
      );
    const unitIds = order.items
      .map((item) => item.unitId)
      .filter((unitId): unitId is string => Boolean(unitId));
    if (unitIds.length !== order.items.length)
      throw new AppError(
        409,
        'INVALID_ALLOCATION',
        'An active order must have every unit allocated',
      );
    const units = await lockUnits(tx, unitIds);
    const protectedEnds = new Map(
      order.items.map((item) => {
        const unit = units.find((candidate) => candidate.id === item.unitId);
        if (!unit)
          throw new AppError(409, 'UNIT_UNAVAILABLE', 'Allocated unit is no longer available');
        return [
          item.id,
          bookingReservationUntil(
            input.newDueAt,
            order.policyVersion.lateReturnBufferMinutes,
            unit.variant?.cleaningBufferMinutes ?? item.variant?.cleaningBufferMinutes ?? 0,
          ),
        ];
      }),
    );
    for (const item of order.items)
      await assertUnitAvailableForPeriod(
        tx,
        item.unitId!,
        order.plannedDueAt,
        protectedEnds.get(item.id)!,
        item.id,
      );
    const additionalFeeVnd = order.items.reduce(
      (sum, item) => sum + item.unitDailyPriceVnd * BigInt(totalDays - item.billableDays),
      0n,
    );
    const result = await tx.rentalOrder.update({
      where: { id },
      data: {
        plannedDueAt: input.newDueAt,
        additionalRentalFeeVnd: { increment: additionalFeeVnd },
        version: { increment: 1 },
        items: {
          update: order.items.map((item) => ({
            where: { id: item.id },
            data: { occupiedUntil: protectedEnds.get(item.id)!, billableDays: totalDays },
          })),
        },
      },
      include: includeOrder(),
    });
    await addEvent(tx, id, 'ORDER_EXTENDED', actor.id, 'ACTIVE', 'ACTIVE', {
      previousDueAt: order.plannedDueAt.toISOString(),
      newDueAt: input.newDueAt.toISOString(),
      previousBillableDays: order.items[0]?.billableDays ?? 0,
      billableDays: totalDays,
      additionalFeeVnd: additionalFeeVnd.toString(),
      reason: input.reason,
    });
    return result;
  }, transactionOptions);
}
export async function amendOrderItem(
  actor: AuthenticatedActor,
  id: string,
  orderItemId: string,
  input: AmendOrderItemInput,
) {
  requireEmployee(actor);
  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, id);
    assertManage(actor, order);
    assertStatus(order.status, ['CONFIRMED', 'PREPARING']);
    assertVersion(order.version, input.expectedVersion);
    if (
      order.payments.some(
        (payment) => payment.status === 'PENDING' && payment.method === 'PAYMENT_GATEWAY',
      )
    )
      throw new AppError(
        409,
        'PENDING_PAYMENT_REQUIRES_CANCELLATION',
        'Cancel pending payment gateway links before amending this order',
      );
    const item = order.items.find((value) => value.id === orderItemId);
    if (!item) throw new AppError(404, 'ORDER_ITEM_NOT_FOUND', 'Rental order item not found');
    const variants = await tx.costumeVariant.findMany({
      where: { id: { in: [item.variantId, input.newVariantId] } },
      include: { model: { include: { category: true } } },
    });
    const nextVariant = variants.find((variant) => variant.id === input.newVariantId);
    if (!nextVariant) throw new AppError(404, 'VARIANT_NOT_FOUND', 'Replacement variant not found');
    if (
      nextVariant.status !== 'ACTIVE' ||
      nextVariant.model.status !== 'ACTIVE' ||
      nextVariant.model.category.status !== 'ACTIVE'
    )
      throw new AppError(
        409,
        'VARIANT_INACTIVE',
        'Replacement variant and its hierarchy must be active',
      );
    if (item.accessories.length > 0 && item.variant.modelId !== nextVariant.modelId)
      throw new AppError(
        409,
        'AMENDMENT_ACCESSORIES_REQUIRE_REVIEW',
        'Items with accessories can only change size or variant within the same costume model',
      );
    const unitIds = [item.unitId, input.newUnitId].filter((unitId): unitId is string =>
      Boolean(unitId),
    );
    const units = await lockUnits(tx, unitIds);
    const newUnit = units.find((unit) => unit.id === input.newUnitId)!;
    if (
      newUnit.variantId !== nextVariant.id ||
      newUnit.currentBranchId !== order.pickupBranchId ||
      newUnit.operationalStatus !== 'READY'
    )
      throw new AppError(
        409,
        'UNIT_UNAVAILABLE',
        'Replacement unit does not match an available variant',
      );
    await assertUnitAvailableForPeriod(
      tx,
      newUnit.id,
      item.occupiedFrom,
      item.occupiedUntil,
      item.id,
    );
    const rentalDeltaVnd =
      (nextVariant.dailyRentalPriceVnd - item.unitDailyPriceVnd) * BigInt(item.billableDays);
    const depositDeltaVnd = nextVariant.depositAmountVnd - item.unitDepositVnd;
    const result = await tx.rentalOrder.update({
      where: { id },
      data: {
        items: {
          update: {
            where: { id: item.id },
            data: {
              variantId: nextVariant.id,
              unitId: newUnit.id,
              allocationStatus: 'CONFIRMED',
              allocatedBy: actor.id,
              unitDailyPriceVnd: nextVariant.dailyRentalPriceVnd,
              unitDepositVnd: nextVariant.depositAmountVnd,
            },
          },
        },
        version: { increment: 1 },
      },
      include: includeOrder(),
    });
    await addEvent(tx, id, 'ORDER_ITEM_AMENDED', actor.id, order.status, order.status, {
      orderItemId: item.id,
      previousVariantId: item.variantId,
      newVariantId: nextVariant.id,
      previousUnitId: item.unitId,
      newUnitId: newUnit.id,
      previousUnitDailyPriceVnd: item.unitDailyPriceVnd.toString(),
      newUnitDailyPriceVnd: nextVariant.dailyRentalPriceVnd.toString(),
      previousUnitDepositVnd: item.unitDepositVnd.toString(),
      newUnitDepositVnd: nextVariant.depositAmountVnd.toString(),
      rentalDeltaVnd: rentalDeltaVnd.toString(),
      depositDeltaVnd: depositDeltaVnd.toString(),
      reason: input.reason,
    });
    return result;
  }, transactionOptions);
}
async function transition(
  actor: AuthenticatedActor,
  id: string,
  expectedVersion: number,
  from: OrderStatus[],
  to: OrderStatus,
  event: string,
  permissionAction: 'prepare' = 'prepare',
) {
  requireEmployee(actor);
  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, id);
    assertRentalAction(actor, order, permissionAction);
    assertStatus(order.status, from);
    assertVersion(order.version, expectedVersion);
    await lockActiveBranch(tx, order.pickupBranchId);
    const result = await tx.rentalOrder.update({
      where: { id },
      data: { status: to, version: { increment: 1 } },
      include: includeOrder(),
    });
    await addEvent(tx, id, event, actor.id, order.status, to);
    return result;
  }, transactionOptions);
}
export const prepareOrder = (actor: AuthenticatedActor, id: string, expectedVersion: number) =>
  transition(actor, id, expectedVersion, ['CONFIRMED'], 'PREPARING', 'PREPARATION_STARTED', 'prepare');
export const markOrderReady = (actor: AuthenticatedActor, id: string, expectedVersion: number) =>
  transition(actor, id, expectedVersion, ['PREPARING'], 'READY_FOR_PICKUP', 'ORDER_READY', 'prepare');
export async function rejectOrder(
  actor: AuthenticatedActor,
  id: string,
  expectedVersion: number,
  reason: string,
) {
  requireEmployee(actor);
  return endOrder(actor, id, expectedVersion, 'REJECTED', reason, ['PENDING_CONFIRMATION']);
}
export async function cancelOrder(
  actor: AuthenticatedActor,
  id: string,
  expectedVersion: number,
  reason: string,
) {
  requireActor(actor);
  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, id);
    const isCustomer = canOwn(actor, 'manage', order.customerUserId);
    if (isCustomer) {
      assertStatus(order.status, ['PENDING_CONFIRMATION']);
    } else {
      requireEmployee(actor);
      assertManage(actor, order);
      assertStatus(order.status, [
        'PENDING_CONFIRMATION',
        'CONFIRMED',
        'PREPARING',
        'READY_FOR_PICKUP',
      ]);
    }
    assertVersion(order.version, expectedVersion);
    return finishOrder(tx, order, actor.id, 'CANCELLED', reason);
  }, transactionOptions);
}
export async function markNoShow(
  actor: AuthenticatedActor,
  id: string,
  expectedVersion: number,
  reason: string,
) {
  requireEmployee(actor);
  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, id);
    assertManage(actor, order);
    assertStatus(order.status, ['READY_FOR_PICKUP']);
    assertVersion(order.version, expectedVersion);
    if (
      new Date() <
      new Date(order.plannedStartAt.getTime() + order.policyVersion.noShowGraceMinutes * 60_000)
    )
      throw new AppError(409, 'NO_SHOW_TOO_EARLY', 'No-show grace period has not elapsed');
    return finishOrder(tx, order, actor.id, 'NO_SHOW', reason);
  }, transactionOptions);
}
async function endOrder(
  actor: AuthenticatedActor,
  id: string,
  expectedVersion: number,
  status: 'REJECTED' | 'CANCELLED',
  reason: string,
  from: OrderStatus[],
) {
  requireActor(actor);
  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, id);
    assertManage(actor, order);
    assertStatus(order.status, from);
    assertVersion(order.version, expectedVersion);
    return finishOrder(tx, order, actor.id, status, reason);
  }, transactionOptions);
}
async function finishOrder(
  tx: Prisma.TransactionClient,
  order: Awaited<ReturnType<typeof lockOrder>>,
  actorId: string,
  status: 'REJECTED' | 'CANCELLED' | 'NO_SHOW',
  reason: string,
) {
  await tx.rentalOrderItem.updateMany({
    where: { orderId: order.id },
    data: { allocationStatus: 'RELEASED' },
  });
  const result = await tx.rentalOrder.update({
    where: { id: order.id },
    data: { status, version: { increment: 1 } },
    include: includeOrder(),
  });
  await addEvent(tx, order.id, status, actorId, order.status, status, { reason });
  return result;
}
async function storeEvidence(
  tx: Prisma.TransactionClient,
  itemId: string,
  phase: 'PICKUP' | 'RETURN',
  evidence: {
    uploadKey: string;
    contentType: 'image/jpeg' | 'image/png' | 'image/webp';
    size: number;
    capturedAt?: Date;
  }[],
  actorId: string,
) {
  for (const image of evidence) {
    if (!image.uploadKey.startsWith('rental-staging/'))
      throw new AppError(400, 'INVALID_EVIDENCE', 'Evidence key is invalid');
    const extension =
      image.contentType === 'image/jpeg'
        ? 'jpg'
        : image.contentType === 'image/png'
          ? 'png'
          : 'webp';
    const objectKey = `rentals/${itemId}/${phase.toLowerCase()}/${randomUUID()}.${extension}`;
    await promoteStoredImage({
      uploadKey: image.uploadKey,
      objectKey,
      contentType: image.contentType,
      maxBytes: env.MEDIA_MAX_UPLOAD_BYTES,
    });
    await tx.rentalItemEvidence.create({
      data: {
        orderItemId: itemId,
        phase,
        objectKey,
        sourceUploadKey: image.uploadKey,
        contentType: image.contentType,
        sizeBytes: image.size,
        uploadedBy: actorId,
        capturedAt: image.capturedAt,
      },
    });
  }
}

async function assertPickupUnitsReady(
  tx: Prisma.TransactionClient,
  order: Awaited<ReturnType<typeof lockOrder>>,
) {
  const unitIds = order.items.map((item) => item.unitId).filter((value): value is string => Boolean(value));
  if (unitIds.length !== order.items.length || new Set(unitIds).size !== unitIds.length)
    throw new AppError(409, 'UNIT_NOT_READY', 'Every order item must have its own assigned unit');
  const units = await lockUnits(tx, unitIds);
  const checkedAt = new Date();
  for (const item of order.items) {
    const unit = units.find((candidate) => candidate.id === item.unitId);
    if (
      unit?.variantId !== item.variantId ||
      unit?.currentBranchId !== order.pickupBranchId ||
      unit?.operationalStatus !== 'READY'
    )
      throw new AppError(
        409,
        'UNIT_NOT_READY',
        'Trang phục chưa sẵn sàng tại chi nhánh nhận. Hãy kiểm tra lại bộ được phân công.',
      );
    const [activeAllocation, activeBlock, activeTransfer] = await Promise.all([
      tx.rentalOrderItem.findFirst({
        where: {
          unitId: unit.id,
          id: { not: item.id },
          allocationStatus: 'ACTIVE',
          order: { status: { in: ['ACTIVE', 'RETURN_INSPECTION'] } },
        },
        select: { id: true },
      }),
      tx.unitBlock.findFirst({
        where: {
          unitId: unit.id,
          status: { in: ['PLANNED', 'IN_PROGRESS'] },
          blockedFrom: { lte: checkedAt },
          blockedUntil: { gt: checkedAt },
        },
        select: { id: true },
      }),
      tx.stockTransferItem.findFirst({
        where: { unitId: unit.id, transfer: { status: { in: ['REQUESTED', 'APPROVED', 'IN_TRANSIT'] } } },
        select: { id: true },
      }),
    ]);
    if (activeAllocation)
      throw new AppError(
        409,
        'UNIT_STILL_WITH_CUSTOMER',
        'Chưa thể bàn giao: bộ này vẫn đang được thuê hoặc chưa được xác nhận trả.',
      );
    if (activeBlock || activeTransfer)
      throw new AppError(
        409,
        'UNIT_NOT_READY',
        'Trang phục đang vệ sinh, sửa chữa hoặc điều chuyển nên chưa thể bàn giao.',
      );
  }
  return units;
}
export async function validatePickupOrder(
  actor: AuthenticatedActor,
  id: string,
  expectedVersion: number,
) {
  requireEmployee(actor);
  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, id);
    assertRentalAction(actor, order, 'handover');
    assertStatus(order.status, ['READY_FOR_PICKUP']);
    assertVersion(order.version, expectedVersion);
    await assertPickupUnitsReady(tx, order);
    return { ready: true, unitCount: order.items.length };
  }, transactionOptions);
}
export async function pickupOrder(actor: AuthenticatedActor, id: string, input: PickupInput) {
  requireEmployee(actor);
  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, id);
    assertRentalAction(actor, order, 'handover');
    assertStatus(order.status, ['READY_FOR_PICKUP']);
    assertVersion(order.version, input.expectedVersion);
    const rentalDue = rentalDueBeforeExtensionsVnd(
      order.items,
      order.promotionDiscountVnd,
      order.additionalRentalFeeVnd,
    );
    const depositDue = depositDueVnd(order.items);
    const paidRental = successfulPaymentTotal(order.payments, 'RENTAL');
    const paidDeposit = successfulPaymentTotal(order.payments, 'DEPOSIT');
    if (paidRental < rentalDue || paidDeposit < depositDue)
      throw new AppError(
        409,
        'PAYMENT_REQUIRED',
        'Rental payment and deposit must succeed before pickup',
      );
    const itemIds = order.items.map((x) => x.id).sort();
    const received = input.items.map((x) => x.orderItemId).sort();
    if (itemIds.length !== received.length || itemIds.some((v, i) => v !== received[i]))
      throw new AppError(
        400,
        'INVALID_PICKUP_ITEMS',
        'Every order item must be supplied exactly once',
      );
    await assertPickupUnitsReady(tx, order);
    for (const item of input.items) {
      await storeEvidence(tx, item.orderItemId, 'PICKUP', item.evidence, actor.id);
      await tx.rentalOrderItem.update({
        where: { id: item.orderItemId },
        data: { pickupConditionGrade: item.conditionGrade, pickupEvidenceKey: null },
      });
    }
    const result = await tx.rentalOrder.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        pickedUpAt: new Date(),
        pickupProcessedBy: actor.id,
        version: { increment: 1 },
        items: { updateMany: { where: {}, data: { allocationStatus: 'ACTIVE' } } },
      },
      include: includeOrder(),
    });
    await addEvent(tx, id, 'PICKED_UP', actor.id, 'READY_FOR_PICKUP', 'ACTIVE');
    return result;
  }, transactionOptions);
}
export async function returnOrder(actor: AuthenticatedActor, id: string, input: ReturnInput) {
  requireEmployee(actor);
  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, id);
    assertRentalAction(actor, order, 'return');
    assertStatus(order.status, ['ACTIVE']);
    assertVersion(order.version, input.expectedVersion);
    const activeItems = order.items.filter((item) =>
      ['ACTIVE', 'CONFIRMED'].includes(item.allocationStatus),
    );
    const expected = activeItems.map((x) => x.id).sort();
    const received = input.items.map((x) => x.orderItemId).sort();
    const hasAllActiveItems =
      expected.length === received.length && expected.every((v, i) => v === received[i]);
    if (
      (input.partial && (received.length === 0 || hasAllActiveItems)) ||
      (!input.partial && !hasAllActiveItems)
    )
      throw new AppError(
        400,
        'INVALID_RETURN_ITEMS',
        input.partial
          ? 'A partial return must contain at least one, but not all, active order items'
          : 'Every active order item must be supplied exactly once',
      );
    const units = await lockUnits(tx, input.items.map((inputItem) => {
      const orderItem = order.items.find((item) => item.id === inputItem.orderItemId);
      if (
        !orderItem ||
        !['ACTIVE', 'CONFIRMED'].includes(orderItem.allocationStatus) ||
        !orderItem.unitId
      )
        throw new AppError(400, 'INVALID_RETURN_ITEMS', 'Only active order items can be returned');
      return orderItem.unitId;
    }));
    const returnedAt = new Date();
    for (const inputItem of input.items) {
      const orderItem = order.items.find((x) => x.id === inputItem.orderItemId)!;
      if (
        inputItem.returnConditionGrade === 'DAMAGED' &&
        inputItem.nextOperationalStatus !== 'REPAIR'
      )
        throw new AppError(400, 'INVALID_RETURN_STATUS', 'Damaged units must enter repair');
      const expectedAccessoryIds = orderItem.accessories.map((accessory) => accessory.id).sort();
      const returnedAccessoryIds = inputItem.accessories
        .map((accessory) => accessory.accessoryId)
        .sort();
      if (
        expectedAccessoryIds.length !== returnedAccessoryIds.length ||
        expectedAccessoryIds.some(
          (accessoryId, index) => accessoryId !== returnedAccessoryIds[index],
        ) ||
        new Set(returnedAccessoryIds).size !== returnedAccessoryIds.length
      )
        throw new AppError(
          400,
          'INVALID_RETURN_ACCESSORIES',
          'Every order accessory must be supplied exactly once',
        );
      for (const accessory of inputItem.accessories) {
        const original = orderItem.accessories.find((value) => value.id === accessory.accessoryId)!;
        if (accessory.quantityReturned > original.quantityOut)
          throw new AppError(
            400,
            'INVALID_RETURN_ACCESSORIES',
            'Returned quantity exceeds quantity out',
          );
      }
      if (
        inputItem.nextOperationalStatus === 'REPAIR' &&
        (!inputItem.repairBlockedUntil || inputItem.repairBlockedUntil <= returnedAt)
      )
        throw new AppError(
          400,
          'REPAIR_BLOCK_UNTIL_REQUIRED',
          'Repair requires a future blocked-until time',
        );
      await storeEvidence(tx, orderItem.id, 'RETURN', inputItem.evidence, actor.id);
      await tx.rentalOrderItem.update({
        where: { id: orderItem.id },
        data: {
          returnConditionGrade: inputItem.returnConditionGrade,
          isMissing: inputItem.isMissing,
          damageNotes: inputItem.damageNotes ?? null,
          returnEvidenceKey: null,
          accessories: {
            update: inputItem.accessories.map((a) => ({
              where: { id: a.accessoryId },
              data: {
                quantityReturned: a.quantityReturned,
                conditionIn: a.conditionIn ?? null,
              },
            })),
          },
        },
      });
      if (inputItem.isMissing)
        await tx.costumeUnit.update({
          where: { id: orderItem.unitId! },
          data: {
            conditionGrade: 'DAMAGED',
            conditionNotes: inputItem.damageNotes ?? 'Reported missing by customer',
            operationalStatus: 'RETIRED',
            retiredAt: new Date(),
          },
        });
      else
        await tx.costumeUnit.update({
          where: { id: orderItem.unitId! },
          data: {
            conditionGrade: inputItem.returnConditionGrade,
            conditionNotes: inputItem.damageNotes ?? null,
            operationalStatus: inputItem.nextOperationalStatus,
          },
        });
      if (!inputItem.isMissing) {
        const unit = units.find((value) => value.id === orderItem.unitId)!;
        const blockType = inputItem.nextOperationalStatus === 'REPAIR' ? 'REPAIR' : 'CLEANING';
        const cleaningMinutes = unit.variant.cleaningBufferMinutes ?? 0;
        const blockedUntil =
          blockType === 'REPAIR'
            ? inputItem.repairBlockedUntil!
            : new Date(returnedAt.getTime() + Math.max(cleaningMinutes, 1) * 60_000);
        await tx.unitBlock.create({
          data: {
            unitId: unit.id,
            blockType,
            blockedFrom: returnedAt,
            blockedUntil,
            reason: `Automatic ${blockType.toLowerCase()} after return ${order.orderCode}`,
            createdBy: actor.id,
          },
        });
      }
    }
    const isFinalReturn = !input.partial;
    const lateFeeFormulaVersion = order.policyVersion.lateFeeFormulaVersion ?? 1;
    const itemBasedFee = lateFeeFormulaVersion >= 2;
    const calculatedLateFee = itemBasedFee
      ? calculateItemLateFees(
          order.items,
          input.items.map((item) => item.orderItemId),
          order.plannedDueAt,
          returnedAt,
          order.policyVersion.lateGraceMinutes,
          Number(order.policyVersion.lateFeePercentPerDay),
          order.promotionDiscountVnd,
        )
      : {
          ...calculateLegacyLateFee(
            order.items,
            order.plannedDueAt,
            returnedAt,
            order.policyVersion.lateGraceMinutes,
            Number(order.policyVersion.lateFeePercentPerDay),
          ),
          items: [],
        };
    const lateFee = {
      ...calculatedLateFee,
      lateFeeVnd: itemBasedFee || isFinalReturn ? calculatedLateFee.lateFeeVnd : 0n,
    };
    const result = await tx.rentalOrder.update({
      where: { id },
      data: {
        ...(isFinalReturn
          ? {
              status: 'RETURN_INSPECTION' as const,
              returnedAt,
              returnProcessedBy: actor.id,
              returnNotes: input.returnNotes ?? null,
              inspectionStatus: 'PENDING_ASSESSMENT' as const,
            }
          : {
              status: 'ACTIVE' as const,
              returnNotes: input.returnNotes ?? order.returnNotes,
            }),
        ...(itemBasedFee
          ? { lateFeeVnd: { increment: lateFee.lateFeeVnd } }
          : isFinalReturn
            ? { lateFeeVnd: lateFee.lateFeeVnd }
            : {}),
        version: { increment: 1 },
        items: {
          updateMany: {
            where: { id: { in: input.items.map((item) => item.orderItemId) } },
            data: { allocationStatus: 'COMPLETED' },
          },
        },
      },
      include: includeOrder(),
    });
    await addEvent(
      tx,
      id,
      isFinalReturn ? 'RETURNED' : 'PARTIAL_RETURNED',
      actor.id,
      'ACTIVE',
      isFinalReturn ? 'RETURN_INSPECTION' : 'ACTIVE',
      {
        inspectionStatus: isFinalReturn ? 'PENDING_ASSESSMENT' : undefined,
        returnedItemIds: input.items.map((item) => item.orderItemId),
        returnedAt: returnedAt.toISOString(),
        lateFeeFormulaVersion,
        lateDays: lateFee.lateDays,
        lateFeeVnd: lateFee.lateFeeVnd.toString(),
        lateItems: lateFee.items,
      },
    );
    return result;
  }, transactionOptions);
}

function outstanding(order: Awaited<ReturnType<typeof lockOrder>>) {
  const rentalDue = rentalDueBeforeExtensionsVnd(
    order.items,
    order.promotionDiscountVnd,
    order.additionalRentalFeeVnd,
  );
  const depositDue = depositDueVnd(order.items);
  const extraDue =
    order.additionalRentalFeeVnd + damageDueVnd(order.items) + order.lateFeeVnd + order.otherFeeVnd;
  const paidRental = successfulPaymentTotal(order.payments, 'RENTAL');
  const paidDeposit = successfulPaymentTotal(order.payments, 'DEPOSIT');
  const paidExtra = successfulPaymentTotal(order.payments, 'EXTRA');
  const refunds = order.payments.flatMap((payment) => payment.refunds);
  const refundedVnd = refunds
    .filter((refund) => refund.status === 'COMPLETED')
    .reduce((sum, refund) => sum + refund.amountVnd, 0n);
  const refundInProgressVnd = refunds
    .filter((refund) => ['REQUESTED', 'PROCESSING'].includes(refund.status))
    .reduce((sum, refund) => sum + refund.amountVnd, 0n);
  const rentalRemainingVnd = rentalDue - paidRental;
  const extraRemainingVnd = extraDue - paidExtra - order.depositDeductionVnd;
  const refundRemainingVnd = paidDeposit - order.depositDeductionVnd - refundedVnd;
  return {
    rental: { dueVnd: rentalDue, paidVnd: paidRental, remainingVnd: rentalRemainingVnd },
    deposit: {
      dueVnd: depositDue,
      paidVnd: paidDeposit,
      deductionVnd: order.depositDeductionVnd,
      refundedVnd,
      refundRemainingVnd,
      refundInProgressVnd,
    },
    extra: { dueVnd: extraDue, paidVnd: paidExtra, remainingVnd: extraRemainingVnd },
    outstandingVnd:
      (rentalRemainingVnd > 0n ? rentalRemainingVnd : 0n) +
      (extraRemainingVnd > 0n ? extraRemainingVnd : 0n),
    canComplete: rentalRemainingVnd <= 0n && extraRemainingVnd <= 0n && refundRemainingVnd === 0n,
  };
}

function assertAssessmentItems(
  order: Awaited<ReturnType<typeof lockOrder>>,
  input: AssessmentInput,
) {
  const expected = order.items.map((item) => item.id).sort();
  const received = input.items.map((item) => item.orderItemId).sort();
  if (
    expected.length !== received.length ||
    expected.some((value, index) => value !== received[index])
  )
    throw new AppError(
      400,
      'INVALID_ASSESSMENT_ITEMS',
      'Every order item must be assessed exactly once',
    );
  for (const item of input.items) {
    const orderItem = order.items.find((value) => value.id === item.orderItemId)!;
    const expectedAccessories = orderItem.accessories.map((accessory) => accessory.id).sort();
    const assessedAccessories = item.accessories.map((accessory) => accessory.accessoryId).sort();
    if (
      expectedAccessories.length !== assessedAccessories.length ||
      expectedAccessories.some((value, index) => value !== assessedAccessories[index])
    )
      throw new AppError(
        400,
        'INVALID_ASSESSMENT_ACCESSORIES',
        'Every returned accessory must be assessed exactly once',
      );
  }
}

export async function assessReturn(actor: AuthenticatedActor, id: string, input: AssessmentInput) {
  requireEmployee(actor);
  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, id);
    assertRentalAction(actor, order, 'assessment');
    assertStatus(order.status, ['RETURN_INSPECTION']);
    assertVersion(order.version, input.expectedVersion);
    const wasAssessed = order.inspectionStatus !== 'PENDING_ASSESSMENT';
    if (order.financiallySettledAt)
      throw new AppError(409, 'ASSESSMENT_LOCKED', 'Settlement is already completed');
    if (
      order.payments.some(
        (payment) =>
          payment.purpose === 'EXTRA' && ['PENDING', 'SUCCEEDED'].includes(payment.status),
      ) ||
      order.payments.some((payment) => payment.refunds.length > 0)
    )
      throw new AppError(
        409,
        'ASSESSMENT_LOCKED',
        'Cancel pending extra payments and resolve refunds before changing assessment',
      );
    assertAssessmentItems(order, input);
    const before = damageDueVnd(order.items);
    for (const item of input.items) {
      await tx.rentalOrderItem.update({
        where: { id: item.orderItemId },
        data: {
          damageFeeVnd: item.damageFeeVnd,
          missingFeeVnd: item.missingFeeVnd,
          accessories: {
            update: item.accessories.map((accessory) => ({
              where: { id: accessory.accessoryId },
              data: {
                damageFeeVnd: accessory.damageFeeVnd,
                missingFeeVnd: accessory.missingFeeVnd,
              },
            })),
          },
        },
      });
    }
    const status = order.items.some((item) => item.isMissing)
      ? 'HAS_MISSING_ITEM'
      : input.items.some(
            (item) =>
              item.damageFeeVnd > 0n ||
              item.missingFeeVnd > 0n ||
              item.accessories.some(
                (accessory) => accessory.damageFeeVnd > 0n || accessory.missingFeeVnd > 0n,
              ),
          )
        ? 'HAS_DAMAGE'
        : 'PASSED';
    const result = await tx.rentalOrder.update({
      where: { id },
      data: { inspectionStatus: status, version: { increment: 1 } },
      include: includeOrder(),
    });
    await addEvent(
      tx,
      id,
      wasAssessed ? 'RETURN_ASSESSMENT_AMENDED' : 'RETURN_ASSESSED',
      actor.id,
      undefined,
      undefined,
      { beforeDamageFeesVnd: before.toString(), assessmentStatus: status },
    );
    return result;
  }, transactionOptions);
}

export async function getOutstanding(actor: AuthenticatedActor, id: string) {
  const order = await prisma.rentalOrder.findUnique({ where: { id }, include: includeOrder() });
  if (!order) throw new AppError(404, 'RENTAL_ORDER_NOT_FOUND', 'Rental order not found');
  assertRead(actor, order);
  return { orderId: order.id, status: order.status, ...outstanding(order) };
}

export async function listDebts(actor: AuthenticatedActor, query: DebtListInput) {
  requireEmployee(actor);
  const orders = await prisma.rentalOrder.findMany({
    where: {
      status: 'RETURN_INSPECTION',
      ...(query.pickupBranchId ? { pickupBranchId: query.pickupBranchId } : {}),
      ...(query.customerUserId ? { customerUserId: query.customerUserId } : {}),
    },
    include: includeOrder(),
    orderBy: { returnedAt: 'asc' },
  });
  const visible = orders
    .filter((order) => {
      try {
        assertRead(actor, order);
        return true;
      } catch {
        return false;
      }
    })
    .map((order) => ({
      orderId: order.id,
      orderCode: order.orderCode,
      customerUserId: order.customerUserId,
      pickupBranchId: order.pickupBranchId,
      ...outstanding(order),
    }))
    .filter((row) => row.outstandingVnd > 0n || row.deposit.refundRemainingVnd > 0n);
  const start = (query.page - 1) * query.pageSize;
  return pageResult(visible.slice(start, start + query.pageSize), visible.length, {
    ...query,
    sortBy: 'returnedAt',
    sortOrder: 'asc',
  });
}
export async function completeOrder(actor: AuthenticatedActor, id: string, input: CompleteInput) {
  requireEmployee(actor);
  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, id);
    assertRentalAction(actor, order, 'settlement');
    assertStatus(order.status, ['RETURN_INSPECTION']);
    assertVersion(order.version, input.expectedVersion);
    if (order.inspectionStatus === 'PENDING_ASSESSMENT')
      throw new AppError(
        409,
        'ASSESSMENT_REQUIRED',
        'Return assessment must be completed before settlement',
      );
    const hasPreparedSettlement =
      order.otherFeeVnd !== 0n || order.depositDeductionVnd !== 0n || order.settlementNote !== null;
    if (
      hasPreparedSettlement &&
      (order.otherFeeVnd !== input.otherFeeVnd ||
        order.depositDeductionVnd !== input.depositDeductionVnd ||
        (order.settlementNote ?? null) !== (input.settlementNote ?? null))
    )
      throw new AppError(
        409,
        'SETTLEMENT_CONFLICT',
        'Completion must use the prepared settlement values',
      );
    const damage = damageDueVnd(order.items);
    const deposits = depositDueVnd(order.items);
    if (input.depositDeductionVnd > deposits)
      throw new AppError(
        400,
        'INVALID_DEPOSIT_DEDUCTION',
        'Deposit deduction exceeds order deposit',
      );
    const rentalDue = rentalDueBeforeExtensionsVnd(
      order.items,
      order.promotionDiscountVnd,
      order.additionalRentalFeeVnd,
    );
    const extraDue = order.additionalRentalFeeVnd + damage + order.lateFeeVnd + input.otherFeeVnd;
    const paidRental = successfulPaymentTotal(order.payments, 'RENTAL');
    const paidExtra = successfulPaymentTotal(order.payments, 'EXTRA');
    const paidDeposit = successfulPaymentTotal(order.payments, 'DEPOSIT');
    if (
      paidRental < rentalDue ||
      input.depositDeductionVnd > paidDeposit ||
      paidExtra + input.depositDeductionVnd < extraDue
    )
      throw new AppError(
        409,
        'SETTLEMENT_REQUIRED',
        'Successful payments do not cover the rental settlement',
      );
    const refunded = await tx.refund.aggregate({
      where: { payment: { orderId: order.id, purpose: 'DEPOSIT' }, status: 'COMPLETED' },
      _sum: { amountVnd: true },
    });
    const refundDue = paidDeposit - input.depositDeductionVnd;
    if ((refunded._sum.amountVnd ?? 0n) < refundDue)
      throw new AppError(
        409,
        'SETTLEMENT_REQUIRED',
        'Deposit refund must be completed before closing the order',
      );
    if ((refunded._sum.amountVnd ?? 0n) > refundDue)
      throw new AppError(
        409,
        'SETTLEMENT_INVALID',
        'Completed deposit refunds exceed the amount due',
      );
    const result = await tx.rentalOrder.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        otherFeeVnd: input.otherFeeVnd,
        depositDeductionVnd: input.depositDeductionVnd,
        settlementNote: input.settlementNote ?? null,
        financiallySettledAt: new Date(),
        version: { increment: 1 },
      },
      include: includeOrder(),
    });
    await addEvent(tx, id, 'ORDER_COMPLETED', actor.id, 'RETURN_INSPECTION', 'COMPLETED');
    return { ...result, calculatedDamageFeesVnd: damage, totalDepositVnd: deposits };
  }, transactionOptions);
}
export async function listOrderEvents(
  actor: AuthenticatedActor,
  id: string,
  query: { page: number; pageSize: number },
) {
  const order = await getOrder(actor, id);
  const [items, totalItems] = await prisma.$transaction([
    prisma.rentalOrderEvent.findMany({
      where: { orderId: order.id },
      orderBy: { occurredAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.rentalOrderEvent.count({ where: { orderId: order.id } }),
  ]);
  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / query.pageSize),
  };
}
