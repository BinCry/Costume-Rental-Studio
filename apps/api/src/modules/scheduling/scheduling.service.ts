import { AppError } from '../../common/errors/app-error.js';
import { pageResult } from '../../common/http/query.js';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { assertPermission, requireActor, type AuthenticatedActor } from '../auth/authorization.js';
import type {
  CompletionInput,
  CreateUnitBlockInput,
  ListUnitBlocksInput,
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
    if (block.status !== 'PLANNED')
      throw new AppError(409, 'UNIT_BLOCK_LOCKED', 'Only planned blocks can be updated');
    if (block.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())
      throw new AppError(
        409,
        'UNIT_BLOCK_VERSION_CONFLICT',
        'Unit block changed by another request',
      );
    const { expectedUpdatedAt, ...data } = input;
    void expectedUpdatedAt;
    const from = data.blockedFrom ?? block.blockedFrom;
    const until = data.blockedUntil ?? block.blockedUntil;
    if (until <= from)
      throw new AppError(400, 'INVALID_BLOCK_PERIOD', 'blockedUntil must be after blockedFrom');
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
      data: { status: 'IN_PROGRESS', startedAt: new Date() },
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
