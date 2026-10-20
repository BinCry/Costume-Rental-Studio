import { AppError } from '../../common/errors/app-error.js';
import { pageResult } from '../../common/http/query.js';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { assertPermission, requireActor, type AuthenticatedActor } from '../auth/authorization.js';
import { lockActiveBranch } from '../branches/branch.service.js';
import type {
  CompletionInput,
  CreateCapacityWindowInput,
  CreateUnitBlockInput,
  ListCapacityWindowsInput,
  ListUnitBlocksInput,
  UpdateCapacityWindowInput,
  UpdateUnitBlockInput,
} from './scheduling.schema.js';

const transactionOptions = { maxWait: 10_000, timeout: 20_000 } as const;
const activeOrderStatuses = [
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'ACTIVE',
  'RETURN_INSPECTION',
] as const;
function assertRead(actor: AuthenticatedActor, branchId: string) {
  assertPermission(actor, { module: 'inventory', action: 'read', branchId });
}
function assertManage(actor: AuthenticatedActor, branchId: string) {
  assertPermission(actor, { module: 'inventory', action: 'manage', branchId });
}
function blockInclude() {
  return {
    unit: { include: { variant: true, currentBranch: true } },
    assignee: true,
    creator: true,
  } satisfies Prisma.UnitBlockInclude;
}
async function lockBlock(tx: Prisma.TransactionClient, id: string) {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM unit_blocks WHERE id = ${id}::uuid FOR UPDATE`;
  if (!rows.length) throw new AppError(404, 'UNIT_BLOCK_NOT_FOUND', 'Unit block not found');
  return tx.unitBlock.findUniqueOrThrow({ where: { id }, include: blockInclude() });
}
async function lockUnit(tx: Prisma.TransactionClient, id: string) {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM costume_units WHERE id = ${id}::uuid FOR UPDATE`;
  if (!rows.length) throw new AppError(404, 'UNIT_NOT_FOUND', 'Unit not found');
  return tx.costumeUnit.findUniqueOrThrow({ where: { id } });
}
async function assertCapacityWindowBranch(
  tx: Prisma.TransactionClient,
  capacityWindowId: string | null | undefined,
  branchId: string,
) {
  if (!capacityWindowId) return;
  const window = await tx.branchCapacityWindow.findUnique({
    where: { id: capacityWindowId },
    select: { branchId: true },
  });
  if (!window) throw new AppError(404, 'CAPACITY_WINDOW_NOT_FOUND', 'Capacity window not found');
  if (window.branchId !== branchId)
    throw new AppError(
      409,
      'CAPACITY_WINDOW_BRANCH_MISMATCH',
      'Capacity window must belong to the unit current branch',
    );
}
async function assertNoConflict(
  tx: Prisma.TransactionClient,
  unitId: string,
  from: Date,
  until: Date,
  excludedBlockId?: string,
) {
  const [block, rental, transfer] = await Promise.all([
    tx.unitBlock.findFirst({
      where: {
        unitId,
        ...(excludedBlockId ? { id: { not: excludedBlockId } } : {}),
        status: { in: ['PLANNED', 'IN_PROGRESS'] },
        blockedFrom: { lt: until },
        blockedUntil: { gt: from },
      },
      select: { id: true },
    }),
    tx.rentalOrderItem.findFirst({
      where: {
        unitId,
        order: { status: { in: [...activeOrderStatuses] } },
        occupiedFrom: { lt: until },
        occupiedUntil: { gt: from },
      },
      select: { id: true },
    }),
    tx.stockTransferItem.findFirst({
      where: { unitId, transfer: { status: { in: ['REQUESTED', 'APPROVED', 'IN_TRANSIT'] } } },
      select: { id: true },
    }),
  ]);
  if (block || rental || transfer)
    throw new AppError(
      409,
      'UNIT_SCHEDULE_CONFLICT',
      'Unit conflicts with a block, rental, or transfer',
    );
}
async function unitEvent(
  tx: Prisma.TransactionClient,
  unitId: string,
  branchId: string,
  actorId: string,
  eventType: string,
  notes: string,
) {
  await tx.unitEvent.create({
    data: {
      unitId,
      eventType,
      fromBranchId: branchId,
      toBranchId: branchId,
      recordedBy: actorId,
      notes,
    },
  });
}

export async function listUnitBlocks(actor: AuthenticatedActor, query: ListUnitBlocksInput) {
  requireActor(actor);
  if (query.branchId) assertRead(actor, query.branchId);
  const where: Prisma.UnitBlockWhereInput = {
    ...(query.unitId ? { unitId: query.unitId } : {}),
    ...(query.branchId ? { unit: { currentBranchId: query.branchId } } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.from && query.to
      ? { blockedFrom: { lt: query.to }, blockedUntil: { gt: query.from } }
      : query.from
        ? { blockedUntil: { gt: query.from } }
        : query.to
          ? { blockedFrom: { lt: query.to } }
          : {}),
  };
  const all = await prisma.unitBlock.findMany({
    where,
    include: blockInclude(),
    orderBy: [{ blockedFrom: 'asc' }, { id: 'asc' }],
  });
  const visible = all.filter((block) => {
    try {
      assertRead(actor, block.unit.currentBranchId);
      return true;
    } catch {
      return false;
    }
  });
  return pageResult(
    visible.slice((query.page - 1) * query.pageSize, query.page * query.pageSize),
    visible.length,
    { ...query, sortBy: 'blockedFrom', sortOrder: 'asc' },
  );
}

export async function getUnitBlock(actor: AuthenticatedActor, id: string) {
  requireActor(actor);
  const block = await prisma.unitBlock.findUnique({ where: { id }, include: blockInclude() });
  if (!block) throw new AppError(404, 'UNIT_BLOCK_NOT_FOUND', 'Unit block not found');
  assertRead(actor, block.unit.currentBranchId);
  return block;
}
export async function createUnitBlock(actor: AuthenticatedActor, input: CreateUnitBlockInput) {
  requireActor(actor);
  return prisma.$transaction(async (tx) => {
    const unit = await lockUnit(tx, input.unitId);
    assertManage(actor, unit.currentBranchId);
    await assertCapacityWindowBranch(tx, input.capacityWindowId, unit.currentBranchId);
    await assertNoConflict(tx, unit.id, input.blockedFrom, input.blockedUntil);
    const result = await tx.unitBlock.create({
      data: {
        ...input,
        assignedTo: input.assignedTo ?? null,
        costVnd: input.costVnd ?? null,
        notes: input.notes ?? null,
        createdBy: actor.id,
      },
      include: blockInclude(),
    });
    await unitEvent(tx, unit.id, unit.currentBranchId, actor.id, 'BLOCK_CREATED', input.reason);
    return result;
  }, transactionOptions);
}
export async function updateUnitBlock(
  actor: AuthenticatedActor,
  id: string,
  input: UpdateUnitBlockInput,
) {
  return prisma.$transaction(async (tx) => {
    const block = await lockBlock(tx, id);
    assertManage(actor, block.unit.currentBranchId);
    if (block.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())
      throw new AppError(
        409,
        'UNIT_BLOCK_VERSION_CONFLICT',
        'Unit block changed by another request',
      );
    const { expectedUpdatedAt, ...data } = input;
    void expectedUpdatedAt;
    if (block.status === 'IN_PROGRESS') {
      const changedFields = Object.keys(data).filter(
        (key) => data[key as keyof typeof data] !== undefined,
      );
      if (
        changedFields.length !== 1 ||
        changedFields[0] !== 'remainingEffortMinutes' ||
        data.remainingEffortMinutes === null
      ) {
        throw new AppError(
          409,
          'UNIT_BLOCK_LOCKED',
          'In-progress blocks only allow a remaining-effort update',
        );
      }
      return tx.unitBlock.update({ where: { id }, data, include: blockInclude() });
    }
    if (block.status !== 'PLANNED')
      throw new AppError(409, 'UNIT_BLOCK_LOCKED', 'Only active blocks can be updated');
    if (data.remainingEffortMinutes !== undefined)
      throw new AppError(
        409,
        'INVALID_REMAINING_EFFORT',
        'Remaining effort can only be updated after a block starts',
      );
    const from = data.blockedFrom ?? block.blockedFrom;
    const until = data.blockedUntil ?? block.blockedUntil;
    if (until <= from)
      throw new AppError(400, 'INVALID_BLOCK_PERIOD', 'blockedUntil must be after blockedFrom');
    const capacityWindowId =
      data.capacityWindowId === undefined ? block.capacityWindowId : data.capacityWindowId;
    await assertCapacityWindowBranch(tx, capacityWindowId, block.unit.currentBranchId);
    await assertNoConflict(tx, block.unitId, from, until, block.id);
    return tx.unitBlock.update({ where: { id }, data, include: blockInclude() });
  }, transactionOptions);
}
export async function startUnitBlock(actor: AuthenticatedActor, id: string) {
  return prisma.$transaction(async (tx) => {
    const block = await lockBlock(tx, id);
    assertManage(actor, block.unit.currentBranchId);
    if (block.status !== 'PLANNED')
      throw new AppError(
        409,
        'INVALID_UNIT_BLOCK_TRANSITION',
        'Only planned blocks can be started',
      );
    const operationalStatus = block.blockType === 'REPAIR' ? 'REPAIR' : 'CLEANING';
    await tx.costumeUnit.update({ where: { id: block.unitId }, data: { operationalStatus } });
    const result = await tx.unitBlock.update({
      where: { id },
      data: {
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        remainingEffortMinutes: block.estimatedEffortMinutes,
      },
      include: blockInclude(),
    });
    await unitEvent(
      tx,
      block.unitId,
      block.unit.currentBranchId,
      actor.id,
      'BLOCK_STARTED',
      block.reason,
    );
    return result;
  }, transactionOptions);
}
export async function completeUnitBlock(
  actor: AuthenticatedActor,
  id: string,
  input: CompletionInput,
) {
  return prisma.$transaction(async (tx) => {
    const block = await lockBlock(tx, id);
    assertManage(actor, block.unit.currentBranchId);
    if (block.status !== 'IN_PROGRESS')
      throw new AppError(
        409,
        'INVALID_UNIT_BLOCK_TRANSITION',
        'Only in-progress blocks can be completed',
      );
    const nextOperationalStatus = input.nextOperationalStatus ?? 'READY';
    await tx.costumeUnit.update({
      where: { id: block.unitId },
      data: { operationalStatus: nextOperationalStatus },
    });
    const result = await tx.unitBlock.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        remainingEffortMinutes: 0,
        finishedAt: new Date(),
        notes: input.notes ?? block.notes,
        costVnd: input.costVnd ?? block.costVnd,
      },
      include: blockInclude(),
    });
    await unitEvent(
      tx,
      block.unitId,
      block.unit.currentBranchId,
      actor.id,
      'BLOCK_COMPLETED',
      input.notes ?? block.reason,
    );
    return result;
  }, transactionOptions);
}
export async function cancelUnitBlock(actor: AuthenticatedActor, id: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const block = await lockBlock(tx, id);
    assertManage(actor, block.unit.currentBranchId);
    if (block.status !== 'PLANNED')
      throw new AppError(
        409,
        'INVALID_UNIT_BLOCK_TRANSITION',
        'Only planned blocks can be cancelled',
      );
    const result = await tx.unitBlock.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        remainingEffortMinutes: 0,
        notes: block.notes ? `${block.notes}\nCancelled: ${reason}` : `Cancelled: ${reason}`,
      },
      include: blockInclude(),
    });
    await unitEvent(
      tx,
      block.unitId,
      block.unit.currentBranchId,
      actor.id,
      'BLOCK_CANCELLED',
      reason,
    );
    return result;
  }, transactionOptions);
}

async function assertNoCapacityWindowOverlap(
  tx: Prisma.TransactionClient,
  branchId: string,
  startsAt: Date,
  endsAt: Date,
  excludedId?: string,
) {
  const overlapping = await tx.branchCapacityWindow.findFirst({
    where: {
      branchId,
      ...(excludedId ? { id: { not: excludedId } } : {}),
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
    select: { id: true },
  });
  if (overlapping)
    throw new AppError(
      409,
      'CAPACITY_WINDOW_CONFLICT',
      'Capacity window overlaps another window for this branch',
    );
}

async function lockCapacityWindow(tx: Prisma.TransactionClient, id: string) {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM branch_capacity_windows WHERE id = ${id}::uuid FOR UPDATE`;
  if (!rows.length)
    throw new AppError(404, 'CAPACITY_WINDOW_NOT_FOUND', 'Capacity window not found');
  return tx.branchCapacityWindow.findUniqueOrThrow({ where: { id } });
}

export async function listCapacityWindows(
  actor: AuthenticatedActor,
  query: ListCapacityWindowsInput,
) {
  requireActor(actor);
  assertRead(actor, query.branchId);
  const where: Prisma.BranchCapacityWindowWhereInput = {
    branchId: query.branchId,
    ...(query.from && query.to
      ? { startsAt: { lt: query.to }, endsAt: { gt: query.from } }
      : query.from
        ? { endsAt: { gt: query.from } }
        : query.to
          ? { startsAt: { lt: query.to } }
          : {}),
  };
  const [items, totalItems] = await prisma.$transaction([
    prisma.branchCapacityWindow.findMany({
      where,
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.branchCapacityWindow.count({ where }),
  ]);
  return pageResult(items, totalItems, { ...query, sortBy: 'startsAt', sortOrder: 'asc' });
}

export async function createCapacityWindow(
  actor: AuthenticatedActor,
  input: CreateCapacityWindowInput,
) {
  requireActor(actor);
  assertManage(actor, input.branchId);
  return prisma.$transaction(async (tx) => {
    await lockActiveBranch(tx, input.branchId);
    await assertNoCapacityWindowOverlap(tx, input.branchId, input.startsAt, input.endsAt);
    return tx.branchCapacityWindow.create({
      data: { ...input, notes: input.notes ?? null, createdBy: actor.id },
    });
  }, transactionOptions);
}

export async function updateCapacityWindow(
  actor: AuthenticatedActor,
  id: string,
  input: UpdateCapacityWindowInput,
) {
  requireActor(actor);
  return prisma.$transaction(async (tx) => {
    const current = await lockCapacityWindow(tx, id);
    assertManage(actor, current.branchId);
    await lockActiveBranch(tx, current.branchId);
    if (current.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())
      throw new AppError(409, 'CAPACITY_WINDOW_VERSION_CONFLICT', 'Capacity window changed');
    const startsAt = input.startsAt ?? current.startsAt;
    const endsAt = input.endsAt ?? current.endsAt;
    if (endsAt <= startsAt)
      throw new AppError(400, 'INVALID_CAPACITY_WINDOW', 'endsAt must be after startsAt');
    await assertNoCapacityWindowOverlap(tx, current.branchId, startsAt, endsAt, id);
    const { expectedUpdatedAt, ...data } = input;
    void expectedUpdatedAt;
    return tx.branchCapacityWindow.update({ where: { id }, data });
  }, transactionOptions);
}

export async function deleteCapacityWindow(actor: AuthenticatedActor, id: string) {
  requireActor(actor);
  return prisma.$transaction(async (tx) => {
    const current = await lockCapacityWindow(tx, id);
    assertManage(actor, current.branchId);
    await tx.branchCapacityWindow.delete({ where: { id } });
    return { id };
  }, transactionOptions);
}
