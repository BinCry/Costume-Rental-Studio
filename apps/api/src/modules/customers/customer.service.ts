import { randomUUID } from 'node:crypto';

import { AppError } from '../../common/errors/app-error.js';
import { prisma } from '../../database/prisma.js';
import type { CreateCustomerInput } from './customer.schema.js';
import { pageResult, pagination } from '../../common/http/query.js';
import { assertPermission, type AuthenticatedActor } from '../auth/authorization.js';
import { lockUserAuthentication } from '../auth/token.service.js';
import { lockActiveBranch } from '../branches/branch.service.js';
import {
  assertActiveGlobalAdmin,
  isActiveGlobalAdmin,
  lockGlobalAdminInvariant,
} from '../rbac/admin-invariant.js';
import type { UpdateCustomerInput } from './customer.schema.js';

export type CustomerActor = AuthenticatedActor;

export async function createCustomer(input: CreateCustomerInput, actor: CustomerActor) {
  if (actor.status !== 'ACTIVE' || actor.employee?.employmentStatus !== 'ACTIVE') {
    throw new AppError(403, 'FORBIDDEN', 'An active employee account is required');
  }
  const allowed = actor.roleAssignments.some((assignment) => {
    if (!assignment.role.isActive) return false;
    if (!['ADMIN', 'SALES_STAFF'].includes(assignment.role.roleCode)) return false;
    if (
      assignment.branchId !== null &&
      (assignment.branchId !== input.branchId || assignment.branch?.status !== 'ACTIVE')
    )
      return false;
    return assignment.role.rolePermissions.some(
      ({ permission }) =>
        permission.module === 'customers' &&
        permission.action === 'create' &&
        ((permission.scope === 'ALL' && assignment.branchId === null) ||
          (permission.scope === 'BRANCH' && assignment.branchId === input.branchId)),
    );
  });
  if (!allowed)
    throw new AppError(403, 'FORBIDDEN', 'Customer creation is not allowed in this branch');

  const run = () =>
    prisma.$transaction(async (tx) => {
      await lockActiveBranch(tx, input.branchId);
      const existing = await tx.user.findUnique({
        where: { email: input.email },
        include: { customer: true },
      });
      if (existing) {
        if (!existing.customer || existing.status !== 'ACTIVE') {
          throw new AppError(
            409,
            'CUSTOMER_CONFLICT',
            'Email belongs to an unavailable or non-customer account',
          );
        }
        return { created: false, customer: summary(existing, existing.customer) };
      }
      if (await tx.user.findUnique({ where: { phone: input.phone } })) {
        throw new AppError(409, 'CONTACT_CONFLICT', 'Phone is already in use by another account');
      }
      const { branchId, displayName, phone, email, birthday, ...profile } = input;
      const user = await tx.user.create({
        data: {
          displayName,
          phone,
          email,
          status: 'ACTIVE',
          customer: {
            create: {
              ...profile,
              customerCode: `CUS-${randomUUID()}`,
              preferredBranchId: branchId,
              birthday: birthday ? new Date(`${birthday}T00:00:00.000Z`) : undefined,
            },
          },
        },
        include: { customer: true },
      });
      return { created: true, customer: summary(user, user.customer!) };
    });

  try {
    return await run();
  } catch (error) {
    if (isUniqueConflict(error)) {
      // A concurrent request may have created the same email or phone. Re-read once.
      try {
        return await run();
      } catch (retryError) {
        if (isUniqueConflict(retryError))
          throw new AppError(409, 'CONTACT_CONFLICT', 'Contact is already in use');
        throw retryError;
      }
    }
    throw error;
  }
}

export async function listCustomers(
  actor: CustomerActor,
  query: { page: number; pageSize: number; search?: string; branchId?: string },
) {
  assertPermission(actor, { module: 'customers', action: 'read', branchId: query.branchId });
  const where = {
    customer: query.branchId ? { is: { preferredBranchId: query.branchId } } : { isNot: null },
    ...(query.search
      ? {
          OR: [
            { displayName: { contains: query.search, mode: 'insensitive' as const } },
            { phone: { contains: query.search } },
            { email: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
  const [users, totalItems] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      include: { customer: true },
      orderBy: { createdAt: 'desc' },
      ...pagination(query as never),
    }),
    prisma.user.count({ where }),
  ]);
  return pageResult(
    users.map((user) => summary(user, user.customer!)),
    totalItems,
    query as never,
  );
}

export async function getCustomer(actor: CustomerActor, userId: string) {
  if (actor.id !== userId) assertPermission(actor, { module: 'customers', action: 'read' });
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { customer: true } });
  if (!user?.customer) throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found');
  return summary(user, user.customer);
}

export async function updateCustomer(
  actor: CustomerActor,
  userId: string,
  input: UpdateCustomerInput,
) {
  if (actor.id !== userId) assertPermission(actor, { module: 'customers', action: 'update' });
  if (actor.id === userId && input.internalNote !== undefined)
    throw new AppError(403, 'FORBIDDEN', 'Customers cannot update internal notes');
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    include: { customer: true, authIdentities: true },
  });
  if (!existing?.customer) throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found');
  const { displayName, email, phone, birthday, ...profile } = input;
  if (
    email !== undefined &&
    email !== existing.email &&
    (existing.passwordHash || existing.emailVerifiedAt || existing.authIdentities.length > 0)
  ) {
    throw new AppError(
      409,
      'EMAIL_CHANGE_REQUIRES_VERIFICATION',
      'A linked account must change email through an email verification flow',
    );
  }
  try {
    return await prisma.$transaction(async (tx) => {
      if (input.preferredBranchId) {
        await lockActiveBranch(tx, input.preferredBranchId);
      }
      const user = await tx.user.update({
        where: { id: userId },
        data: { displayName, email, phone },
      });
      const customer = await tx.customer.update({
        where: { userId },
        data: {
          ...profile,
          preferredBranchId: input.preferredBranchId,
          birthday: birthday ? new Date(`${birthday}T00:00:00.000Z`) : birthday,
        },
      });
      return summary(user, customer);
    });
  } catch (error) {
    if (isUniqueConflict(error))
      throw new AppError(409, 'CONTACT_CONFLICT', 'Email or phone is already in use');
    throw error;
  }
}

export async function setCustomerStatus(
  actor: CustomerActor,
  userId: string,
  status: 'ACTIVE' | 'INACTIVE',
) {
  assertPermission(actor, { module: 'customers', action: 'update' });
  return prisma.$transaction(async (tx) => {
    if (status === 'INACTIVE') await lockGlobalAdminInvariant(tx);
    await lockUserAuthentication(tx, userId);
    const customer = await tx.customer.findUnique({ where: { userId } });
    if (!customer) throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found');
    const protectsAdmin = status === 'INACTIVE' && (await isActiveGlobalAdmin(tx, userId));
    const user = await tx.user.update({
      where: { id: userId },
      data: { status },
      select: {
        id: true,
        email: true,
        phone: true,
        displayName: true,
        avatarUrl: true,
        status: true,
      },
    });
    if (status === 'INACTIVE') {
      await tx.refreshSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    if (protectsAdmin) await assertActiveGlobalAdmin(tx);
    return safeCustomerUser(user);
  });
}

function safeCustomerUser(user: {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string;
  avatarUrl: string | null;
  status: string;
}) {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    status: user.status,
  };
}

function isUniqueConflict(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function summary(
  user: { id: string; displayName: string; phone: string | null; email: string | null },
  customer: { customerCode: string; preferredBranchId: string | null },
) {
  return {
    userId: user.id,
    customerCode: customer.customerCode,
    displayName: user.displayName,
    phone: user.phone,
    email: user.email,
    preferredBranchId: customer.preferredBranchId,
  };
}
