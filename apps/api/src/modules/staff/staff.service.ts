import { AppError } from '../../common/errors/app-error.js';
import { pageResult, pagination } from '../../common/http/query.js';
import { prisma } from '../../database/prisma.js';
import { assertPermission, type AuthenticatedActor } from '../auth/authorization.js';
import type { CreateStaffInput } from './staff.schema.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { lockUserAuthentication } from '../auth/token.service.js';

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
      ? { employmentStatus: query.employmentStatus as 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED' }
      : {},
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
      const user = await tx.user.create({
        data: {
          email: input.email.toLowerCase(),
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
        include: { employee: true },
      });
      for (const assignment of input.assignments)
        await tx.userRoleAssignment.create({
          data: {
            userId: user.id,
            roleId: assignment.roleId,
            branchId: assignment.branchId ?? null,
            assignedBy: actor.id,
          },
        });
      return user;
    });
  } catch (error) {
    if (isUnique(error))
      throw new AppError(409, 'STAFF_CONFLICT', 'Email, phone, or employee code already exists');
    throw error;
  }
}
export async function updateStaff(
  actor: AuthenticatedActor,
  userId: string,
  data: { displayName?: string; phone?: string | null; employmentStatus?: 'ACTIVE' | 'ON_LEAVE' },
) {
  assertPermission(actor, { module: 'staff', action: 'manage' });
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { employee: true } });
  if (!user?.employee) throw new AppError(404, 'STAFF_NOT_FOUND', 'Staff member not found');
  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: { displayName: data.displayName, phone: data.phone },
    });
    if (data.employmentStatus)
      await tx.employee.update({
        where: { userId },
        data: { employmentStatus: data.employmentStatus },
      });
    return updated;
  });
}
export async function terminateStaff(actor: AuthenticatedActor, userId: string) {
  assertPermission(actor, { module: 'staff', action: 'manage' });
  if (actor.id === userId)
    throw new AppError(409, 'SELF_TERMINATION', 'You cannot terminate yourself');
  const employee = await prisma.employee.findUnique({ where: { userId } });
  if (!employee) throw new AppError(404, 'STAFF_NOT_FOUND', 'Staff member not found');
  await prisma.$transaction(async (tx) => {
    await lockUserAuthentication(tx, userId);
    await tx.employee.update({
      where: { userId },
      data: { employmentStatus: 'TERMINATED', terminatedAt: new Date() },
    });
    await tx.user.update({ where: { id: userId }, data: { status: 'INACTIVE' } });
    await tx.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });
  return { userId, status: 'TERMINATED' };
}
export async function assignRole(
  actor: AuthenticatedActor,
  userId: string,
  data: { roleId: string; branchId?: string | null },
) {
  assertPermission(actor, { module: 'staff', action: 'manage' });
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
  if (
    data.branchId &&
    !(await prisma.branch.findFirst({ where: { id: data.branchId, status: 'ACTIVE' } }))
  )
    throw new AppError(400, 'INVALID_BRANCH', 'Branch must exist and be active');
  return prisma.userRoleAssignment.create({
    data: { userId, roleId: data.roleId, branchId: data.branchId ?? null, assignedBy: actor.id },
  });
}
export async function removeAssignment(
  actor: AuthenticatedActor,
  userId: string,
  assignmentId: string,
) {
  assertPermission(actor, { module: 'staff', action: 'manage' });
  const assignment = await prisma.userRoleAssignment.findFirst({
    where: { id: assignmentId, userId },
  });
  if (!assignment) throw new AppError(404, 'ASSIGNMENT_NOT_FOUND', 'Role assignment not found');
  await prisma.userRoleAssignment.delete({ where: { id: assignmentId } });
}
function isUnique(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
