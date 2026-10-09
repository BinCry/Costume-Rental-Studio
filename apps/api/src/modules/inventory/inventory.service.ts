import { AppError } from '../../common/errors/app-error.js';
import { pageResult, pagination } from '../../common/http/query.js';
import { prisma } from '../../database/prisma.js';
import type { OrderStatus, Prisma } from '../../generated/prisma/client.js';
import { assertPermission, requireActor, type AuthenticatedActor } from '../auth/authorization.js';
import { lockActiveBranch } from '../branches/branch.service.js';
import type {
  ChangeUnitStatusInput,
  CreateUnitInput,
  EventListInput,
  InspectUnitInput,
  ListUnitsInput,
  RetireUnitInput,
  UpdateUnitInput,
} from './inventory.schema.js';

const activeOrderStatuses = [
  'DRAFT',
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'ACTIVE',
  'RETURN_INSPECTION',
] satisfies OrderStatus[];

async function lockUnit(transaction: Prisma.TransactionClient, unitId: string) {
  const rows = await transaction.$queryRaw<{ id: string }[]>`
    SELECT id FROM costume_units WHERE id = ${unitId}::uuid FOR UPDATE
  `;
  if (rows.length === 0) throw new AppError(404, 'UNIT_NOT_FOUND', 'Costume unit not found');
  return transaction.costumeUnit.findUniqueOrThrow({ where: { id: unitId } });
}

async function lockActiveVariant(transaction: Prisma.TransactionClient, variantId: string) {
  const rows = await transaction.$queryRaw<
    { variantStatus: string; modelStatus: string; categoryStatus: string }[]
  >`
    SELECT v.status AS "variantStatus", m.status AS "modelStatus", c.status AS "categoryStatus"
    FROM costume_variants v
    INNER JOIN costume_models m ON m.id = v.model_id
    INNER JOIN costume_categories c ON c.id = m.category_id
    WHERE v.id = ${variantId}::uuid
    FOR UPDATE OF v, m, c
  `;
  const item = rows[0];
  if (
    item?.variantStatus !== 'ACTIVE' ||
    item.modelStatus !== 'ACTIVE' ||
    item.categoryStatus !== 'ACTIVE'
  )
    throw new AppError(400, 'INVALID_VARIANT', 'Variant must exist and be active');
}

function unitInclude() {
  return {
    variant: { include: { model: { include: { category: true } } } },
    currentBranch: true,
  } satisfies Prisma.CostumeUnitInclude;
}

function assertRead(actor: AuthenticatedActor, branchId?: string) {
  assertPermission(actor, { module: 'inventory', action: 'read', branchId });
}
function assertManage(actor: AuthenticatedActor, branchId: string) {
  assertPermission(actor, { module: 'inventory', action: 'manage', branchId });
}

function hasGlobalInventoryRead(actor: AuthenticatedActor) {
  return actor.roleAssignments.some(
    (assignment) =>
      assignment.branchId === null &&
      assignment.role.isActive &&
      assignment.role.rolePermissions.some(
        ({ permission }) =>
          permission.module === 'inventory' &&
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
        permission.module === 'inventory' &&
        permission.action === 'read' &&
        permission.scope === 'BRANCH',
    )
      ? [assignment.branchId]
      : [];
  });
}

function eventRecorder(actor: AuthenticatedActor) {
  return actor.employee ? actor.id : undefined;
}

export async function listUnits(actor: AuthenticatedActor, query: ListUnitsInput) {
  requireActor(actor);
  const accessibleBranches = readableBranchIds(actor);
  const canReadAll = hasGlobalInventoryRead(actor);
  if (query.branchId) assertRead(actor, query.branchId);
  else if (!canReadAll && accessibleBranches.length === 0) assertRead(actor);
  const where: Prisma.CostumeUnitWhereInput = {
    ...(query.search ? { unitCode: { contains: query.search, mode: 'insensitive' } } : {}),
    ...(query.branchId
      ? { currentBranchId: query.branchId }
      : !canReadAll
        ? { currentBranchId: { in: accessibleBranches } }
        : {}),
    ...(query.variantId ? { variantId: query.variantId } : {}),
    ...(query.operationalStatus ? { operationalStatus: query.operationalStatus } : {}),
    ...(query.conditionGrade ? { conditionGrade: query.conditionGrade } : {}),
  };
  const orderBy: Prisma.CostumeUnitOrderByWithRelationInput = { [query.sortBy]: query.sortOrder };
  const [items, totalItems] = await prisma.$transaction([
    prisma.costumeUnit.findMany({
      where,
      include: unitInclude(),
      orderBy: [orderBy, { id: 'asc' }],
      ...pagination(query),
    }),
    prisma.costumeUnit.count({ where }),
  ]);
  return pageResult(items, totalItems, query);
}

export async function getUnit(actor: AuthenticatedActor, unitId: string) {
  const unit = await prisma.costumeUnit.findUnique({
    where: { id: unitId },
    include: unitInclude(),
  });
  if (!unit) throw new AppError(404, 'UNIT_NOT_FOUND', 'Costume unit not found');
  assertRead(actor, unit.currentBranchId);
  return unit;
}

export async function createUnit(actor: AuthenticatedActor, input: CreateUnitInput) {
  assertManage(actor, input.branchId);
  try {
    return await prisma.$transaction(async (transaction) => {
      await lockActiveBranch(transaction, input.branchId);
      await lockActiveVariant(transaction, input.variantId);
      const unit = await transaction.costumeUnit.create({
        data: {
          unitCode: input.unitCode.toUpperCase(),
          variantId: input.variantId,
          currentBranchId: input.branchId,
          acquiredAt: input.acquiredAt,
          acquisitionCostVnd: input.acquisitionCostVnd,
          conditionNotes: input.conditionNotes,
          conditionGrade: 'UNINSPECTED',
          operationalStatus: 'INBOUND',
        },
        include: unitInclude(),
      });
      await transaction.unitEvent.create({
        data: {
          unitId: unit.id,
          eventType: 'ACQUIRED',
          toBranchId: input.branchId,
          recordedBy: eventRecorder(actor),
          notes: input.conditionNotes,
        },
      });
      return unit;
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')
      throw new AppError(409, 'UNIT_CODE_CONFLICT', 'Unit code already exists');
    throw error;
  }
}

export async function updateUnit(
  actor: AuthenticatedActor,
  unitId: string,
  input: UpdateUnitInput,
) {
  const existing = await getUnit(actor, unitId);
  assertManage(actor, existing.currentBranchId);
  return prisma.$transaction(async (transaction) => {
    const unit = await lockUnit(transaction, unitId);
    assertManage(actor, unit.currentBranchId);
    return transaction.costumeUnit.update({
      where: { id: unitId },
      data: input,
      include: unitInclude(),
    });
  });
}

export async function inspectUnit(
  actor: AuthenticatedActor,
  unitId: string,
  input: InspectUnitInput,
) {
  const existing = await getUnit(actor, unitId);
  assertManage(actor, existing.currentBranchId);
  return prisma.$transaction(async (transaction) => {
    const unit = await lockUnit(transaction, unitId);
    assertManage(actor, unit.currentBranchId);
    if (unit.operationalStatus !== 'INBOUND')
      throw new AppError(409, 'INVALID_UNIT_TRANSITION', 'Only inbound units can be inspected');
    const updated = await transaction.costumeUnit.update({
      where: { id: unitId },
      data: {
        conditionGrade: input.conditionGrade,
        conditionNotes: input.notes,
        operationalStatus: input.nextStatus,
      },
      include: unitInclude(),
    });
    await transaction.unitEvent.create({
      data: {
        unitId,
        eventType: 'INSPECTED',
        recordedBy: eventRecorder(actor),
        notes: input.notes,
      },
    });
    return updated;
  });
}

export async function changeUnitStatus(
  actor: AuthenticatedActor,
  unitId: string,
  input: ChangeUnitStatusInput,
) {
  const existing = await getUnit(actor, unitId);
  assertManage(actor, existing.currentBranchId);
  return prisma.$transaction(async (transaction) => {
    const unit = await lockUnit(transaction, unitId);
    assertManage(actor, unit.currentBranchId);
    const allowed: Record<string, readonly string[]> = {
      READY: ['CLEANING', 'REPAIR'],
      CLEANING: ['READY', 'REPAIR'],
      REPAIR: ['READY'],
    };
    if (!allowed[unit.operationalStatus]?.includes(input.targetStatus))
      throw new AppError(409, 'INVALID_UNIT_TRANSITION', 'Unit status transition is not allowed');
    const activeTransfers = await transaction.stockTransferItem.count({
      where: {
        unitId,
        transfer: { status: { in: ['REQUESTED', 'APPROVED', 'IN_TRANSIT'] } },
      },
    });
    if (activeTransfers)
      throw new AppError(409, 'UNIT_IN_USE', 'Unit has an active stock transfer');
    const updated = await transaction.costumeUnit.update({
      where: { id: unitId },
      data: { operationalStatus: input.targetStatus },
      include: unitInclude(),
    });
    await transaction.unitEvent.create({
      data: {
        unitId,
        eventType: 'STATUS_CHANGED',
        recordedBy: eventRecorder(actor),
        notes: input.notes,
      },
    });
    return updated;
  });
}

export async function retireUnit(
  actor: AuthenticatedActor,
  unitId: string,
  input: RetireUnitInput,
) {
  const existing = await getUnit(actor, unitId);
  assertManage(actor, existing.currentBranchId);
  return prisma.$transaction(async (transaction) => {
    const unit = await lockUnit(transaction, unitId);
    assertManage(actor, unit.currentBranchId);
    if (unit.operationalStatus === 'RETIRED' || unit.operationalStatus === 'IN_TRANSFER')
      throw new AppError(
        409,
        'INVALID_UNIT_TRANSITION',
        'Unit cannot be retired from its current status',
      );
    const [orders, transfers, blocks] = await Promise.all([
      transaction.rentalOrderItem.count({
        where: { unitId, order: { status: { in: activeOrderStatuses } } },
      }),
      transaction.stockTransferItem.count({
        where: { unitId, transfer: { status: { in: ['REQUESTED', 'APPROVED', 'IN_TRANSIT'] } } },
      }),
      transaction.unitBlock.count({
        where: { unitId, status: { in: ['PLANNED', 'IN_PROGRESS'] } },
      }),
    ]);
    if (orders || transfers || blocks)
      throw new AppError(409, 'UNIT_IN_USE', 'Unit has active orders, transfers, or blocks');
    const updated = await transaction.costumeUnit.update({
      where: { id: unitId },
      data: { operationalStatus: 'RETIRED', retiredAt: new Date() },
      include: unitInclude(),
    });
    await transaction.unitEvent.create({
      data: { unitId, eventType: 'RETIRED', recordedBy: eventRecorder(actor), notes: input.notes },
    });
    return updated;
  });
}

export async function listUnitEvents(
  actor: AuthenticatedActor,
  unitId: string,
  query: EventListInput,
) {
  const unit = await getUnit(actor, unitId);
  assertRead(actor, unit.currentBranchId);
  const where = { unitId };
  const [items, totalItems] = await prisma.$transaction([
    prisma.unitEvent.findMany({
      where,
      include: { fromBranch: true, toBranch: true, recorder: { include: { user: true } } },
      orderBy: [{ occurredAt: query.sortOrder }, { id: 'asc' }],
      ...pagination(query),
    }),
    prisma.unitEvent.count({ where }),
  ]);
  return pageResult(items, totalItems, query);
}
