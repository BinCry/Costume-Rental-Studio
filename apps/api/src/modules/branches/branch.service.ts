import { AppError } from '../../common/errors/app-error.js';
import { pageResult, pagination, type ListQuery } from '../../common/http/query.js';
import { prisma } from '../../database/prisma.js';
import { assertPermission, type AuthenticatedActor } from '../auth/authorization.js';
import type { CreateBranchInput, UpdateBranchInput } from './branch.schema.js';

export async function listBranches(
  actor: AuthenticatedActor,
  query: ListQuery & { status?: string },
) {
  assertPermission(actor, { module: 'branches', action: 'manage' });
  const where = {
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { branchCode: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(query.status ? { status: query.status as 'ACTIVE' | 'INACTIVE' } : {}),
  };
  const [items, totalItems] = await prisma.$transaction([
    prisma.branch.findMany({
      where,
      orderBy: { createdAt: query.sortOrder },
      ...pagination(query),
    }),
    prisma.branch.count({ where }),
  ]);
  return pageResult(items, totalItems, query);
}

export async function getBranch(actor: AuthenticatedActor, branchId: string) {
  assertPermission(actor, { module: 'branches', action: 'manage' });
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
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) throw new AppError(404, 'BRANCH_NOT_FOUND', 'Branch not found');
  if (status === 'INACTIVE') {
    const [activeOrders, activeTransfers] = await prisma.$transaction([
      prisma.rentalOrder.count({
        where: {
          pickupBranchId: branchId,
          status: {
            in: ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'ACTIVE', 'RETURN_INSPECTION'],
          },
        },
      }),
      prisma.stockTransfer.count({
        where: {
          OR: [{ fromBranchId: branchId }, { toBranchId: branchId }],
          status: { in: ['REQUESTED', 'APPROVED', 'IN_TRANSIT'] },
        },
      }),
    ]);
    if (activeOrders > 0 || activeTransfers > 0)
      throw new AppError(409, 'BRANCH_IN_USE', 'Branch has active orders or transfers');
  }
  return prisma.branch.update({ where: { id: branchId }, data: { status } });
}

function isUnique(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
