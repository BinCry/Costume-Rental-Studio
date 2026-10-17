import { AppError } from '../../common/errors/app-error.js';
import { pageResult, pagination } from '../../common/http/query.js';
import { prisma } from '../../database/prisma.js';
import { assertPermission, type AuthenticatedActor } from '../auth/authorization.js';
import type { CreateStaffInput } from './staff.schema.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { lockUserAuthentication } from '../auth/token.service.js';
import { lockActiveBranch } from '../branches/branch.service.js';
import {
  assertActiveGlobalAdmin,
  isActiveGlobalAdmin,
  lockGlobalAdminInvariant,
} from '../rbac/admin-invariant.js';

export async function listStaff(
  actor: AuthenticatedActor,
  query: {
    page: number;
    pageSize: number;
    search?: string;
    employmentStatus?: string;
    branchId?: string;
  },
) {
  assertPermission(actor, { module: 'staff', action: 'manage' });
  const where: Prisma.UserWhereInput = {
    employee: query.employmentStatus
      ? {
          is: {
            employmentStatus: query.employmentStatus as 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED',
          },
        }
      : { isNot: null },
    ...(query.branchId ? { roleAssignments: { some: { branchId: query.branchId } } } : {}),
    ...(query.search
      ? {
          OR: [
            { displayName: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [items, totalItems] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      include: { employee: true, roleAssignments: { include: { role: true, branch: true } } },
      orderBy: { createdAt: 'desc' },
      ...pagination(query as never),
    }),
    prisma.user.count({ where }),
  ]);
  return pageResult(
    items.map(({ passwordHash, ...safe }) => {
      void passwordHash;
      return safe;
    }),
    totalItems,
    query as never,
  );
}
export async function getStaff(actor: AuthenticatedActor, userId: string) {
  assertPermission(actor, { module: 'staff', action: 'manage' });
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { employee: true, roleAssignments: { include: { role: true, branch: true } } },
  });
  if (!user?.employee) throw new AppError(404, 'STAFF_NOT_FOUND', 'Staff member not found');
  const { passwordHash, ...safe } = user;
  void passwordHash;
  return safe;
}
export async function createStaff(actor: AuthenticatedActor, input: CreateStaffInput) {
  assertPermission(actor, { module: 'staff', action: 'manage' });
  try {
    return await prisma.$transaction(async (tx) => {
      const email = input.email.trim().toLowerCase();
      const roles = await tx.role.findMany({
        where: { id: { in: input.assignments.map((assignment) => assignment.roleId) } },
      });
      const rolesById = new Map(roles.map((role) => [role.id, role]));
      const isGlobalAdmin = actor.roleAssignments.some(
        (assignment) => assignment.role.roleCode === 'ADMIN' && assignment.branchId === null,
      );
      for (const assignment of input.assignments) {
        const role = rolesById.get(assignment.roleId);
        if (!role || !role.isActive || role.actorGroup === 'CUSTOMER')
          throw new AppError(400, 'INVALID_ROLE', 'Role is not assignable to staff');
        if (role.actorGroup === 'ADMIN' && (assignment.branchId || !isGlobalAdmin))
          throw new AppError(
            403,
            'ADMIN_ROLE_RESTRICTED',
            'Global admin role requires a global admin actor and no branch assignment',
          );
        if (assignment.branchId) await lockActiveBranch(tx, assignment.branchId);
      }
      // Serialize staff provisioning with Google sign-in and customer registration.
      // This lets an admin attach a verified customer account instead of creating a
      // second identity that can never own the same unique email address.
      const candidate = await tx.user.findUnique({ where: { email }, select: { id: true } });
      if (candidate) await lockUserAuthentication(tx, candidate.id);
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`auth-email:${email}`}, 0))`;
      const existing = await tx.user.findUnique({
        where: { email },
        include: { customer: true, employee: true, authIdentities: true, roleAssignments: true },
      });

      if (candidate?.id !== existing?.id) {
        throw new AppError(409, 'STAFF_CONFLICT', 'Account changed; reload and try again');
      }

      let user: {
        id: string;
        email: string | null;
        phone: string | null;
        displayName: string;
        avatarUrl: string | null;
        status: string;
        employee: {
          userId: string;
          employeeCode: string;
          employmentStatus: string;
          joinedAt: Date;
          activatedAt: Date | null;
          terminatedAt: Date | null;
        } | null;
      };
      let accountLinkedToExistingCustomer = false;

      if (existing) {
        if (
          existing.status !== 'ACTIVE' ||
          !existing.customer ||
          existing.employee ||
          !existing.emailVerifiedAt
        ) {
          throw new AppError(
            409,
            'STAFF_CONFLICT',
            'Only an active customer account with a verified email can be linked to staff',
          );
        }
        const now = new Date();
        const employee = await tx.employee.create({
          data: {
            userId: existing.id,
            employeeCode: input.employeeCode.toUpperCase(),
            employmentStatus: 'ACTIVE',
            joinedAt: input.joinedAt,
            // A verified active customer has already proved control of this email.
            // The admin's explicit staff assignment can therefore take effect on
            // this same account without a second identity or a duplicate login.
            activatedAt: now,
            createdBy: actor.id,
          },
          select: {
            userId: true,
            employeeCode: true,
            employmentStatus: true,
            joinedAt: true,
            activatedAt: true,
            terminatedAt: true,
          },
        });
        user = { ...existing, employee };
        accountLinkedToExistingCustomer = true;

        const existingAssignments = new Set(
          existing.roleAssignments.map(
            (assignment) => `${assignment.roleId}:${assignment.branchId ?? ''}`,
          ),
        );
        for (const assignment of input.assignments) {
          const key = `${assignment.roleId}:${assignment.branchId ?? ''}`;
          if (existingAssignments.has(key)) continue;
          await tx.userRoleAssignment.create({
            data: {
              userId: existing.id,
              roleId: assignment.roleId,
              branchId: assignment.branchId ?? null,
              assignedBy: actor.id,
            },
          });
        }
      } else {
        user = await tx.user.create({
          data: {
            email,
            phone: input.phone,
            displayName: input.displayName,
            status: 'PENDING',
            employee: {
              create: {
                employeeCode: input.employeeCode.toUpperCase(),
                joinedAt: input.joinedAt,
                createdBy: actor.id,
              },
            },
          },
          select: {
            id: true,
            email: true,
            phone: true,
            displayName: true,
            avatarUrl: true,
            status: true,
            employee: {
              select: {
                userId: true,
                employeeCode: true,
                employmentStatus: true,
                joinedAt: true,
                activatedAt: true,
                terminatedAt: true,
              },
            },
          },
        });
        for (const assignment of input.assignments) {
          await tx.userRoleAssignment.create({
            data: {
              userId: user.id,
              roleId: assignment.roleId,
              branchId: assignment.branchId ?? null,
              assignedBy: actor.id,
            },
          });
        }
      }

      return safeCreatedStaffUser(user, accountLinkedToExistingCustomer);
    });
  } catch (error) {
    if (isUnique(error))
      throw new AppError(
        409,
        'STAFF_CONFLICT',
        'Employee code, phone, or linked account is already in use',
      );
    throw error;
  }
}
export async function updateStaff(
  actor: AuthenticatedActor,
  userId: string,
  data: { displayName?: string; phone?: string | null; employmentStatus?: 'ACTIVE' | 'ON_LEAVE' },
) {
  assertPermission(actor, { module: 'staff', action: 'manage' });
  return prisma.$transaction(async (tx) => {
    if (data.employmentStatus) {
      await lockGlobalAdminInvariant(tx);
      await lockUserAuthentication(tx, userId);
    }
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { employee: { select: { userId: true } } },
    });
    if (!user?.employee) throw new AppError(404, 'STAFF_NOT_FOUND', 'Staff member not found');

    const protectsAdmin =
      data.employmentStatus === 'ON_LEAVE' && (await isActiveGlobalAdmin(tx, userId));
    const updated = await tx.user.update({
      where: { id: userId },
      data: { displayName: data.displayName, phone: data.phone },
      select: {
        id: true,
        email: true,
        phone: true,
        displayName: true,
        avatarUrl: true,
        status: true,
      },
    });
    if (data.employmentStatus)
      await tx.employee.update({
        where: { userId },
        data: { employmentStatus: data.employmentStatus },
      });
    if (protectsAdmin) await assertActiveGlobalAdmin(tx);
    return safeStaffUser(updated);
  });
}
export async function terminateStaff(actor: AuthenticatedActor, userId: string) {
  assertPermission(actor, { module: 'staff', action: 'manage' });
  if (actor.id === userId)
    throw new AppError(409, 'SELF_TERMINATION', 'You cannot terminate yourself');
  await prisma.$transaction(async (tx) => {
    await lockGlobalAdminInvariant(tx);
    await lockUserAuthentication(tx, userId);
    const employee = await tx.employee.findUnique({ where: { userId } });
    if (!employee) throw new AppError(404, 'STAFF_NOT_FOUND', 'Staff member not found');
    const protectsAdmin = await isActiveGlobalAdmin(tx, userId);
    await tx.employee.update({
      where: { userId },
      data: { employmentStatus: 'TERMINATED', terminatedAt: new Date() },
    });
    await tx.user.update({ where: { id: userId }, data: { status: 'INACTIVE' } });
    await tx.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (protectsAdmin) await assertActiveGlobalAdmin(tx);
  });
  return { userId, status: 'TERMINATED' };
}
export async function assignRole(
  actor: AuthenticatedActor,
  userId: string,
  data: { roleId: string; branchId?: string | null },
) {
  assertPermission(actor, { module: 'staff', action: 'manage' });
  const employee = await prisma.employee.findUnique({ where: { userId } });
  if (!employee) throw new AppError(404, 'STAFF_NOT_FOUND', 'Staff member not found');
  const role = await prisma.role.findUnique({ where: { id: data.roleId } });
  if (!role || !role.isActive || role.actorGroup === 'CUSTOMER')
    throw new AppError(400, 'INVALID_ROLE', 'Role is not assignable to staff');
  if (
    role.actorGroup === 'ADMIN' &&
    (data.branchId ||
      !actor.roleAssignments.some(
        (assignment) => assignment.role.roleCode === 'ADMIN' && assignment.branchId === null,
      ))
  )
    throw new AppError(
      403,
      'ADMIN_ROLE_RESTRICTED',
      'Global admin role requires a global admin actor',
    );
  return prisma.$transaction(async (transaction) => {
    if (data.branchId) await lockActiveBranch(transaction, data.branchId);
    return transaction.userRoleAssignment.create({
      data: { userId, roleId: data.roleId, branchId: data.branchId ?? null, assignedBy: actor.id },
    });
  });
}
export async function removeAssignment(
  actor: AuthenticatedActor,
  userId: string,
  assignmentId: string,
) {
  assertPermission(actor, { module: 'staff', action: 'manage' });
  await prisma.$transaction(async (tx) => {
    await lockGlobalAdminInvariant(tx);
    const assignment = await tx.userRoleAssignment.findFirst({
      where: { id: assignmentId, userId },
      include: { role: true },
    });
    if (!assignment) throw new AppError(404, 'ASSIGNMENT_NOT_FOUND', 'Role assignment not found');
    if (actor.id === userId && assignment.branchId === null && assignment.role.roleCode === 'ADMIN')
      throw new AppError(
        409,
        'SELF_ADMIN_ASSIGNMENT_REMOVAL',
        'You cannot remove your own global administrator assignment',
      );

    const protectsAdmin =
      assignment.branchId === null &&
      assignment.role.roleCode === 'ADMIN' &&
      (await isActiveGlobalAdmin(tx, userId));
    await tx.userRoleAssignment.delete({ where: { id: assignmentId } });
    if (protectsAdmin) await assertActiveGlobalAdmin(tx);
  });
}
function safeCreatedStaffUser(
  user: {
    id: string;
    email: string | null;
    phone: string | null;
    displayName: string;
    avatarUrl: string | null;
    status: string;
    employee: {
      userId: string;
      employeeCode: string;
      employmentStatus: string;
      joinedAt: Date;
      activatedAt: Date | null;
      terminatedAt: Date | null;
    } | null;
  },
  accountLinkedToExistingCustomer = false,
) {
  return {
    ...safeStaffUser(user),
    accountLinkedToExistingCustomer,
    employee: user.employee
      ? {
          userId: user.employee.userId,
          employeeCode: user.employee.employeeCode,
          employmentStatus: user.employee.employmentStatus,
          joinedAt: user.employee.joinedAt,
          activatedAt: user.employee.activatedAt,
          terminatedAt: user.employee.terminatedAt,
        }
      : null,
  };
}
function safeStaffUser(user: {
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
function isUnique(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
