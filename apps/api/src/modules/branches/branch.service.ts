import { AppError } from '../../common/errors/app-error.js';
import { pageResult, pagination } from '../../common/http/query.js';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { assertPermission, type AuthenticatedActor } from '../auth/authorization.js';
import type { BranchListInput, CreateBranchInput, UpdateBranchInput } from './branch.schema.js';

export async function lockBranchForUpdate(transaction: Prisma.TransactionClient, branchId: string) {
  const branches = await transaction.$queryRaw<{ id: string; status: 'ACTIVE' | 'INACTIVE' }[]>`
    SELECT id, status
    FROM branches
    WHERE id = ${branchId}::uuid
    FOR UPDATE
  `;
  const branch = branches[0];
  if (!branch) throw new AppError(404, 'BRANCH_NOT_FOUND', 'Branch not found');
  return branch;
}

/** Call this in the same transaction that creates a branch-bound record. */
export async function lockActiveBranch(transaction: Prisma.TransactionClient, branchId: string) {
  const branch = await lockBranchForUpdate(transaction, branchId);
  if (branch.status !== 'ACTIVE')
    throw new AppError(400, 'INVALID_BRANCH', 'Branch must exist and be active');
  return branch;
}

export async function listBranches(actor: AuthenticatedActor, query: BranchListInput) {
  assertPermission(actor, { module: 'branches', action: 'read' });
  const where = {
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { branchCode: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(query.status ? { status: query.status } : {}),
  };
  const orderBy: Prisma.BranchOrderByWithRelationInput = { [query.sortBy]: query.sortOrder };
  const [items, totalItems] = await prisma.$transaction([
    prisma.branch.findMany({
      where,
      orderBy: [orderBy, { id: 'asc' }],
      ...pagination(query),
    }),
    prisma.branch.count({ where }),
  ]);
  return pageResult(items, totalItems, query);
}

export async function getBranch(actor: AuthenticatedActor, branchId: string) {
  assertPermission(actor, { module: 'branches', action: 'read' });
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) throw new AppError(404, 'BRANCH_NOT_FOUND', 'Branch not found');
  return branch;
}

export async function createBranch(actor: AuthenticatedActor, input: CreateBranchInput) {
  assertPermission(actor, { module: 'branches', action: 'manage' });
  try {
    return await prisma.branch.create({
      data: { ...input, branchCode: input.branchCode.toUpperCase() },
    });
  } catch (error) {
    if (isUnique(error))
      throw new AppError(409, 'BRANCH_CODE_CONFLICT', 'Branch code already exists');
    throw error;
  }
}

export async function updateBranch(
  actor: AuthenticatedActor,
  branchId: string,
  input: UpdateBranchInput,
) {
  assertPermission(actor, { module: 'branches', action: 'manage' });
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) throw new AppError(404, 'BRANCH_NOT_FOUND', 'Branch not found');
  return prisma.branch.update({ where: { id: branchId }, data: input });
}

export async function setBranchStatus(
  actor: AuthenticatedActor,
  branchId: string,
  status: 'ACTIVE' | 'INACTIVE',
) {
  assertPermission(actor, { module: 'branches', action: 'manage' });
  return prisma.$transaction(async (transaction) => {
    await lockBranchForUpdate(transaction, branchId);
    if (status === 'INACTIVE') {
      const [activeOrders, activeTransfers, activeUnits, roleAssignments, openCrmCases] =
        await Promise.all([
          transaction.rentalOrder.count({
            where: {
              pickupBranchId: branchId,
              status: {
                in: [
                  'DRAFT',
                  'PENDING_CONFIRMATION',
                  'CONFIRMED',
                  'PREPARING',
                  'READY_FOR_PICKUP',
                  'ACTIVE',
                  'RETURN_INSPECTION',
                ],
              },
            },
          }),
          transaction.stockTransfer.count({
            where: {
              OR: [{ fromBranchId: branchId }, { toBranchId: branchId }],
              status: { in: ['REQUESTED', 'APPROVED', 'IN_TRANSIT'] },
            },
          }),
          transaction.costumeUnit.count({
            where: { currentBranchId: branchId, operationalStatus: { not: 'RETIRED' } },
          }),
          transaction.userRoleAssignment.count({ where: { branchId } }),
          transaction.crmCase.count({
            where: { branchId, status: { in: ['OPEN', 'IN_PROGRESS'] } },
          }),
        ]);
      if (activeOrders || activeTransfers || activeUnits || roleAssignments || openCrmCases)
        throw new AppError(
          409,
          'BRANCH_IN_USE',
          'Finish orders and transfers, move or retire units, move staff, and resolve CRM cases before deactivating the branch',
        );
    }
    return transaction.branch.update({ where: { id: branchId }, data: { status } });
  });
}

export async function deleteBranch(actor: AuthenticatedActor, branchId: string) {
  assertPermission(actor, { module: 'branches', action: 'manage' });
  await prisma.$transaction(async (transaction) => {
    await lockBranchForUpdate(transaction, branchId);
    const [
      roleAssignments,
      costumeUnits,
      unitEvents,
      stockTransfers,
      rentalOrders,
      preferredCustomers,
      customerInteractions,
      crmCases,
    ] = await Promise.all([
      transaction.userRoleAssignment.count({ where: { branchId } }),
      transaction.costumeUnit.count({ where: { currentBranchId: branchId } }),
      transaction.unitEvent.count({
        where: { OR: [{ fromBranchId: branchId }, { toBranchId: branchId }] },
      }),
      transaction.stockTransfer.count({
        where: { OR: [{ fromBranchId: branchId }, { toBranchId: branchId }] },
      }),
      transaction.rentalOrder.count({ where: { pickupBranchId: branchId } }),
      transaction.customer.count({ where: { preferredBranchId: branchId } }),
      transaction.customerInteraction.count({ where: { branchId } }),
      transaction.crmCase.count({ where: { branchId } }),
    ]);
    if (
      roleAssignments ||
      costumeUnits ||
      unitEvents ||
      stockTransfers ||
      rentalOrders ||
      preferredCustomers ||
      customerInteractions ||
      crmCases
    )
      throw new AppError(
        409,
        'BRANCH_IN_USE',
        'Branch has related records and cannot be deleted; deactivate it instead',
      );
    await transaction.branch.delete({ where: { id: branchId } });
  });
}

function isUnique(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
