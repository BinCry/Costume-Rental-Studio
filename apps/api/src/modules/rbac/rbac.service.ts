import { AppError } from '../../common/errors/app-error.js';
import { prisma } from '../../database/prisma.js';
import { assertPermission, type AuthenticatedActor } from '../auth/authorization.js';
import type { z } from 'zod';
import type { roleSchema } from './rbac.schema.js';
import { assertActiveGlobalAdmin, lockGlobalAdminInvariant } from './admin-invariant.js';
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
  return prisma.$transaction(async (tx) => {
    await lockGlobalAdminInvariant(tx);
    const role = await tx.role.findUnique({ where: { id: roleId } });
    if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', 'Role not found');
    if (role.roleCode === 'ADMIN' && input.actorGroup && input.actorGroup !== 'ADMIN')
      throw new AppError(
        409,
        'ADMIN_LOCKOUT',
        'The global administrator role must remain in the ADMIN actor group',
      );
    const updated = await tx.role.update({
      where: { id: roleId },
      data: { name: input.name, actorGroup: input.actorGroup },
    });
    if (role.roleCode === 'ADMIN' && role.actorGroup !== updated.actorGroup)
      await assertActiveGlobalAdmin(tx);
    return updated;
  });
}
export async function replacePermissions(
  actor: AuthenticatedActor,
  roleId: string,
  permissionIds: string[],
) {
  assertPermission(actor, { module: 'rbac', action: 'manage' });
  return prisma.$transaction(async (tx) => {
    await lockGlobalAdminInvariant(tx);
    const role = await tx.role.findUnique({ where: { id: roleId } });
    if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', 'Role not found');
    const permissionCount = await tx.permission.count({ where: { id: { in: permissionIds } } });
    if (permissionCount !== new Set(permissionIds).size)
      throw new AppError(400, 'INVALID_PERMISSION', 'One or more permissions do not exist');
    await tx.rolePermission.deleteMany({ where: { roleId } });
    if (permissionIds.length)
      await tx.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
      });
    if (role.roleCode === 'ADMIN') await assertActiveGlobalAdmin(tx);
    return tx.role.findUniqueOrThrow({
      where: { id: roleId },
      include: { rolePermissions: { include: { permission: true } } },
    });
  });
}
