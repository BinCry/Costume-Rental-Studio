import { randomUUID } from 'node:crypto';

import { AppError } from '../../common/errors/app-error.js';
import { pageResult, pagination } from '../../common/http/query.js';
import { prisma } from '../../database/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { OrderStatus, TransferStatus } from '../../generated/prisma/client.js';
import {
  assertPermission,
  hasPermission,
  requireActor,
  type AuthenticatedActor,
} from '../auth/authorization.js';
import { lockActiveBranch } from '../branches/branch.service.js';
import type {
  ApproveTransferInput,
  CreateTransferInput,
  EndTransferInput,
  ListTransfersInput,
  ReceiveTransferInput,
  ShipTransferInput,
  UpdateTransferInput,
} from './transfer.schema.js';

const activeOrderStatuses = [
  'DRAFT',
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'ACTIVE',
  'RETURN_INSPECTION',
] satisfies OrderStatus[];
const activeTransferStatuses = ['REQUESTED', 'APPROVED', 'IN_TRANSIT'] satisfies TransferStatus[];

function transferInclude() {
  return {
    fromBranch: true,
    toBranch: true,
    requester: { include: { user: { select: { id: true, displayName: true, avatarUrl: true } } } },
    approver: { include: { user: { select: { id: true, displayName: true, avatarUrl: true } } } },
    shipper: { include: { user: { select: { id: true, displayName: true, avatarUrl: true } } } },
    receiver: { include: { user: { select: { id: true, displayName: true, avatarUrl: true } } } },
    ender: { include: { user: { select: { id: true, displayName: true, avatarUrl: true } } } },
    items: {
      include: {
        unit: {
          include: {
            currentBranch: true,
            variant: { include: { model: { include: { category: true } } } },
          },
        },
      },
    },
  } satisfies Prisma.StockTransferInclude;
}

function requireEmployee(actor: AuthenticatedActor) {
  requireActor(actor);
  if (!actor.employee)
    throw new AppError(403, 'EMPLOYEE_REQUIRED', 'A current employee account is required');
  return actor;
}

function can(actor: AuthenticatedActor, action: 'read' | 'manage', branchId: string) {
  return hasPermission(actor, { module: 'transfers', action, branchId });
}
function assertManage(actor: AuthenticatedActor, branchId: string) {
  assertPermission(actor, { module: 'transfers', action: 'manage', branchId });
}
function assertRead(actor: AuthenticatedActor, branchId: string) {
  assertPermission(actor, { module: 'transfers', action: 'read', branchId });
}
function assertReadEither(actor: AuthenticatedActor, fromBranchId: string, toBranchId: string) {
  requireActor(actor);
  if (!can(actor, 'read', fromBranchId) && !can(actor, 'read', toBranchId))
    throw new AppError(403, 'FORBIDDEN', 'Permission denied for read transfers');
}
function hasGlobalRead(actor: AuthenticatedActor) {
  return actor.roleAssignments.some(
    (assignment) =>
      assignment.branchId === null &&
      assignment.role.isActive &&
      assignment.role.rolePermissions.some(
        ({ permission }) =>
          permission.module === 'transfers' &&
          permission.action === 'read' &&
          permission.scope === 'ALL',
      ),
  );
}
function readableBranchIds(actor: AuthenticatedActor) {
  return actor.roleAssignments.flatMap((assignment) => {
    if (!assignment.branchId || assignment.branch?.status !== 'ACTIVE' || !assignment.role.isActive)
      return [];
    return assignment.role.rolePermissions.some(
      ({ permission }) =>
        permission.module === 'transfers' &&
        permission.action === 'read' &&
        permission.scope === 'BRANCH',
    )
      ? [assignment.branchId]
      : [];
  });
}

async function findTransfer(transferId: string) {
  const transfer = await prisma.stockTransfer.findUnique({
    where: { id: transferId },
    include: transferInclude(),
  });
  if (!transfer) throw new AppError(404, 'TRANSFER_NOT_FOUND', 'Stock transfer not found');
  return transfer;
}

async function lockTransfer(transaction: Prisma.TransactionClient, transferId: string) {
  const rows = await transaction.$queryRaw<{ id: string }[]>`
    SELECT id FROM stock_transfers WHERE id = ${transferId}::uuid FOR UPDATE
  `;
  if (rows.length === 0) throw new AppError(404, 'TRANSFER_NOT_FOUND', 'Stock transfer not found');
  return transaction.stockTransfer.findUniqueOrThrow({
    where: { id: transferId },
    include: transferInclude(),
  });
}

async function lockActiveBranches(transaction: Prisma.TransactionClient, branchIds: string[]) {
  for (const branchId of [...new Set(branchIds)].sort())
    await lockActiveBranch(transaction, branchId);
}

async function lockUnits(transaction: Prisma.TransactionClient, unitIds: string[]) {
  const ids = [...new Set(unitIds)].sort();
  const rows = await transaction.$queryRaw<{ id: string }[]>`
    SELECT id FROM costume_units
    WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
    ORDER BY id
    FOR UPDATE
  `;
  if (rows.length !== ids.length)
    throw new AppError(404, 'UNIT_NOT_FOUND', 'One or more costume units were not found');
  return transaction.costumeUnit.findMany({ where: { id: { in: ids } } });
}

async function assertUnitsAvailable(
  transaction: Prisma.TransactionClient,
  units: { id: string; currentBranchId: string; operationalStatus: string }[],
  fromBranchId: string,
  excludedTransferId?: string,
) {
  if (
    units.some(
      (unit) =>
        unit.currentBranchId !== fromBranchId ||
        (unit.operationalStatus !== 'READY' && unit.operationalStatus !== 'REPAIR'),
    )
  )
    throw new AppError(
      409,
      'UNIT_UNAVAILABLE',
      'Units must be at the source branch and ready or under repair',
    );
  const unitIds = units.map((unit) => unit.id);
  const [orders, blocks, transfers] = await Promise.all([
    transaction.rentalOrderItem.findMany({
      where: { unitId: { in: unitIds }, order: { status: { in: activeOrderStatuses } } },
      select: { unitId: true },
    }),
    transaction.unitBlock.findMany({
      where: { unitId: { in: unitIds }, status: { in: ['PLANNED', 'IN_PROGRESS'] } },
      select: { unitId: true },
    }),
    transaction.stockTransferItem.findMany({
      where: {
        unitId: { in: unitIds },
        ...(excludedTransferId ? { transferId: { not: excludedTransferId } } : {}),
        transfer: { status: { in: activeTransferStatuses } },
      },
      select: { unitId: true },
    }),
  ]);
  if (orders.length || blocks.length || transfers.length)
    throw new AppError(409, 'UNIT_UNAVAILABLE', 'One or more units are already in use');
}

function assertVersion(version: number, expectedVersion: number) {
  if (version !== expectedVersion)
    throw new AppError(409, 'TRANSFER_VERSION_CONFLICT', 'Transfer was changed by another request');
}
function assertStatus(status: TransferStatus, expected: readonly TransferStatus[]) {
  if (!expected.includes(status))
    throw new AppError(
      409,
      'INVALID_TRANSFER_TRANSITION',
      'Transfer status transition is not allowed',
    );
}
function assertExactItems(expectedUnitIds: string[], receivedItems: { unitId: string }[]) {
  const expected = [...expectedUnitIds].sort();
  const received = receivedItems.map((item) => item.unitId).sort();
  if (expected.length !== received.length || expected.some((id, index) => id !== received[index]))
    throw new AppError(
      400,
      'INVALID_TRANSFER_ITEMS',
      'Every transfer item must be supplied exactly once',
    );
}
function transferCode() {
  return `TRF-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
}
function isUnique(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

export async function listTransfers(actor: AuthenticatedActor, query: ListTransfersInput) {
  requireActor(actor);
  const global = hasGlobalRead(actor);
  const branches = readableBranchIds(actor);
  if (query.branchId) assertRead(actor, query.branchId);
  else if (!global && branches.length === 0)
    assertPermission(actor, { module: 'transfers', action: 'read' });
  const visibility: Prisma.StockTransferWhereInput | undefined = query.branchId
    ? { OR: [{ fromBranchId: query.branchId }, { toBranchId: query.branchId }] }
    : global
      ? undefined
      : { OR: [{ fromBranchId: { in: branches } }, { toBranchId: { in: branches } }] };
  const where: Prisma.StockTransferWhereInput = {
    ...(query.search ? { transferCode: { contains: query.search, mode: 'insensitive' } } : {}),
    ...(query.fromBranchId ? { fromBranchId: query.fromBranchId } : {}),
    ...(query.toBranchId ? { toBranchId: query.toBranchId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(visibility ?? {}),
  };
  const orderBy: Prisma.StockTransferOrderByWithRelationInput = { [query.sortBy]: query.sortOrder };
  const [items, totalItems] = await prisma.$transaction([
    prisma.stockTransfer.findMany({
      where,
      include: transferInclude(),
      orderBy: [orderBy, { id: 'asc' }],
      ...pagination(query),
    }),
    prisma.stockTransfer.count({ where }),
  ]);
  return pageResult(items, totalItems, query);
}

export async function getTransfer(actor: AuthenticatedActor, transferId: string) {
  const transfer = await findTransfer(transferId);
  assertReadEither(actor, transfer.fromBranchId, transfer.toBranchId);
  return transfer;
}

export async function createTransfer(actor: AuthenticatedActor, input: CreateTransferInput) {
  requireEmployee(actor);
  assertManage(actor, input.fromBranchId);
  try {
    return await prisma.$transaction(async (transaction) => {
      await lockActiveBranches(transaction, [input.fromBranchId, input.toBranchId]);
      assertManage(actor, input.fromBranchId);
      const units = await lockUnits(transaction, input.unitIds);
      await assertUnitsAvailable(transaction, units, input.fromBranchId);
      return transaction.stockTransfer.create({
        data: {
          transferCode: transferCode(),
          fromBranchId: input.fromBranchId,
          toBranchId: input.toBranchId,
          requestNote: input.requestNote,
          requestedBy: actor.id,
          items: { create: input.unitIds.map((unitId) => ({ unitId })) },
        },
        include: transferInclude(),
      });
    });
  } catch (error) {
    if (isUnique(error))
      throw new AppError(409, 'TRANSFER_CODE_CONFLICT', 'Transfer code already exists');
    throw error;
  }
}

export async function updateTransfer(
  actor: AuthenticatedActor,
  transferId: string,
  input: UpdateTransferInput,
) {
  requireEmployee(actor);
  const existing = await findTransfer(transferId);
  assertManage(actor, existing.fromBranchId);
  return prisma.$transaction(async (transaction) => {
    await lockActiveBranches(transaction, [existing.fromBranchId, existing.toBranchId]);
    const transfer = await lockTransfer(transaction, transferId);
    assertManage(actor, transfer.fromBranchId);
    assertStatus(transfer.status, ['REQUESTED']);
    assertVersion(transfer.version, input.expectedVersion);
    if (input.unitIds) {
      const units = await lockUnits(transaction, input.unitIds);
      await assertUnitsAvailable(transaction, units, transfer.fromBranchId, transfer.id);
    }
    return transaction.stockTransfer.update({
      where: { id: transfer.id },
      data: {
        ...(input.requestNote !== undefined ? { requestNote: input.requestNote } : {}),
        ...(input.unitIds
          ? { items: { deleteMany: {}, create: input.unitIds.map((unitId) => ({ unitId })) } }
          : {}),
        version: { increment: 1 },
      },
      include: transferInclude(),
    });
  });
}

export async function approveTransfer(
  actor: AuthenticatedActor,
  transferId: string,
  input: ApproveTransferInput,
) {
  requireEmployee(actor);
  const existing = await findTransfer(transferId);
  assertManage(actor, existing.toBranchId);
  return prisma.$transaction(async (transaction) => {
    await lockActiveBranches(transaction, [existing.fromBranchId, existing.toBranchId]);
    const transfer = await lockTransfer(transaction, transferId);
    assertManage(actor, transfer.toBranchId);
    assertStatus(transfer.status, ['REQUESTED']);
    assertVersion(transfer.version, input.expectedVersion);
    const units = await lockUnits(
      transaction,
      transfer.items.map((item) => item.unitId),
    );
    await assertUnitsAvailable(transaction, units, transfer.fromBranchId, transfer.id);
    return transaction.stockTransfer.update({
      where: { id: transfer.id },
      data: {
        status: 'APPROVED',
        approvedBy: actor.id,
        approvedAt: new Date(),
        version: { increment: 1 },
      },
      include: transferInclude(),
    });
  });
}

export async function endTransfer(
  actor: AuthenticatedActor,
  transferId: string,
  status: 'REJECTED' | 'CANCELLED',
  input: EndTransferInput,
) {
  requireEmployee(actor);
  const existing = await findTransfer(transferId);
  assertManage(actor, status === 'REJECTED' ? existing.toBranchId : existing.fromBranchId);
  return prisma.$transaction(async (transaction) => {
    await lockActiveBranches(transaction, [existing.fromBranchId, existing.toBranchId]);
    const transfer = await lockTransfer(transaction, transferId);
    assertManage(actor, status === 'REJECTED' ? transfer.toBranchId : transfer.fromBranchId);
    assertStatus(
      transfer.status,
      status === 'REJECTED' ? ['REQUESTED'] : ['REQUESTED', 'APPROVED'],
    );
    assertVersion(transfer.version, input.expectedVersion);
    return transaction.stockTransfer.update({
      where: { id: transfer.id },
      data: {
        status,
        endedBy: actor.id,
        endedAt: new Date(),
        endReason: input.reason,
        version: { increment: 1 },
      },
      include: transferInclude(),
    });
  });
}

export async function shipTransfer(
  actor: AuthenticatedActor,
  transferId: string,
  input: ShipTransferInput,
) {
  requireEmployee(actor);
  const existing = await findTransfer(transferId);
  assertManage(actor, existing.fromBranchId);
  return prisma.$transaction(async (transaction) => {
    await lockActiveBranches(transaction, [existing.fromBranchId, existing.toBranchId]);
    const transfer = await lockTransfer(transaction, transferId);
    assertManage(actor, transfer.fromBranchId);
    assertStatus(transfer.status, ['APPROVED']);
    assertVersion(transfer.version, input.expectedVersion);
    assertExactItems(
      transfer.items.map((item) => item.unitId),
      input.items,
    );
    const units = await lockUnits(
      transaction,
      input.items.map((item) => item.unitId),
    );
    await assertUnitsAvailable(transaction, units, transfer.fromBranchId, transfer.id);
    for (const item of input.items) {
      await transaction.stockTransferItem.update({
        where: { transferId_unitId: { transferId: transfer.id, unitId: item.unitId } },
        data: { conditionOut: item.conditionOut, conditionOutNotes: item.conditionOutNotes },
      });
    }
    await transaction.costumeUnit.updateMany({
      where: { id: { in: input.items.map((item) => item.unitId) } },
      data: { operationalStatus: 'IN_TRANSFER' },
    });
    await transaction.unitEvent.createMany({
      data: input.items.map((item) => ({
        unitId: item.unitId,
        stockTransferId: transfer.id,
        eventType: 'TRANSFER_SHIPPED',
        fromBranchId: transfer.fromBranchId,
        toBranchId: transfer.toBranchId,
        recordedBy: actor.id,
        notes: item.conditionOutNotes,
      })),
    });
    return transaction.stockTransfer.update({
      where: { id: transfer.id },
      data: {
        status: 'IN_TRANSIT',
        shippedBy: actor.id,
        shippedAt: new Date(),
        version: { increment: 1 },
      },
      include: transferInclude(),
    });
  });
}

export async function receiveTransfer(
  actor: AuthenticatedActor,
  transferId: string,
  input: ReceiveTransferInput,
) {
  requireEmployee(actor);
  const existing = await findTransfer(transferId);
  assertManage(actor, existing.toBranchId);
  return prisma.$transaction(async (transaction) => {
    await lockActiveBranches(transaction, [existing.fromBranchId, existing.toBranchId]);
    const transfer = await lockTransfer(transaction, transferId);
    assertManage(actor, transfer.toBranchId);
    assertStatus(transfer.status, ['IN_TRANSIT']);
    assertVersion(transfer.version, input.expectedVersion);
    assertExactItems(
      transfer.items.map((item) => item.unitId),
      input.items,
    );
    const units = await lockUnits(
      transaction,
      input.items.map((item) => item.unitId),
    );
    if (
      units.some(
        (unit) =>
          unit.currentBranchId !== transfer.fromBranchId ||
          unit.operationalStatus !== 'IN_TRANSFER',
      )
    )
      throw new AppError(
        409,
        'UNIT_UNAVAILABLE',
        'Transfer units are not in transit from the source branch',
      );
    for (const item of input.items) {
      await transaction.stockTransferItem.update({
        where: { transferId_unitId: { transferId: transfer.id, unitId: item.unitId } },
        data: {
          conditionIn: item.conditionIn,
          conditionInNotes: item.conditionInNotes,
          receivedOperationalStatus: item.receivedOperationalStatus,
        },
      });
      await transaction.costumeUnit.update({
        where: { id: item.unitId },
        data: {
          currentBranchId: transfer.toBranchId,
          conditionGrade: item.conditionIn,
          conditionNotes: item.conditionInNotes,
          operationalStatus: item.receivedOperationalStatus,
        },
      });
    }
    await transaction.unitEvent.createMany({
      data: input.items.map((item) => ({
        unitId: item.unitId,
        stockTransferId: transfer.id,
        eventType: 'TRANSFER_RECEIVED',
        fromBranchId: transfer.fromBranchId,
        toBranchId: transfer.toBranchId,
        recordedBy: actor.id,
        notes: item.conditionInNotes,
      })),
    });
    return transaction.stockTransfer.update({
      where: { id: transfer.id },
      data: {
        status: 'RECEIVED',
        receivedBy: actor.id,
        receivedAt: new Date(),
        version: { increment: 1 },
      },
      include: transferInclude(),
    });
  });
}
