import { AppError } from '../../common/errors/app-error.js';
import { prisma } from '../../database/prisma.js';
import { assertPermission, type AuthenticatedActor } from '../auth/authorization.js';
import type { z } from 'zod';
import type { roleSchema } from './rbac.schema.js';
type RoleInput = z.infer<typeof roleSchema>;
export async function listRoles(actor: AuthenticatedActor) {
  assertPermission(actor, { module: 'rbac', action: 'manage' });
  return prisma.role.findMany({
    include: { rolePermissions: { include: { permission: true } } },
    orderBy: { roleCode: 'asc' },
  });
}
export async function listPermissions(actor: AuthenticatedActor) {
  assertPermission(actor, { module: 'rbac', action: 'manage' });
  return prisma.permission.findMany({
    orderBy: [{ module: 'asc' }, { action: 'asc' }, { code: 'asc' }],
  });
}
export async function createRole(actor: AuthenticatedActor, input: RoleInput) {
  assertPermission(actor, { module: 'rbac', action: 'manage' });
  return prisma.$transaction(async (tx) => {
    const role = await tx.role.create({
      data: { roleCode: input.roleCode, name: input.name, actorGroup: input.actorGroup },
    });
    if (input.permissionIds.length)
      await tx.rolePermission.createMany({
        data: input.permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
      });
    return tx.role.findUniqueOrThrow({
      where: { id: role.id },
      include: { rolePermissions: { include: { permission: true } } },
    });
  });
}
export async function updateRole(
  actor: AuthenticatedActor,
  roleId: string,
  input: Partial<RoleInput>,
) {
  assertPermission(actor, { module: 'rbac', action: 'manage' });
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', 'Role not found');
  return prisma.role.update({
    where: { id: roleId },
    data: { name: input.name, actorGroup: input.actorGroup },
  });
}
export async function replacePermissions(
  actor: AuthenticatedActor,
  roleId: string,
  permissionIds: string[],
) {
  assertPermission(actor, { module: 'rbac', action: 'manage' });
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: { assignments: true },
  });
  if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', 'Role not found');
  if (role.roleCode === 'ADMIN' && permissionIds.length === 0)
    throw new AppError(409, 'ADMIN_LOCKOUT', 'The admin role must retain permissions');
  const permissionCount = await prisma.permission.count({ where: { id: { in: permissionIds } } });
  if (permissionCount !== new Set(permissionIds).size)
    throw new AppError(400, 'INVALID_PERMISSION', 'One or more permissions do not exist');
  return prisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId } });
    if (permissionIds.length)
      await tx.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
      });
    return tx.role.findUniqueOrThrow({
      where: { id: roleId },
      include: { rolePermissions: { include: { permission: true } } },
    });
  });
}
