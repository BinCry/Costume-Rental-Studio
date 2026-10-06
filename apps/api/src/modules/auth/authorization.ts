import { AppError } from '../../common/errors/app-error.js';
import type { Prisma } from '../../generated/prisma/client.js';

export type AuthenticatedActor = Prisma.UserGetPayload<{
  include: {
    employee: true;
    roleAssignments: {
      include: {
        branch: true;
        role: { include: { rolePermissions: { include: { permission: true } } } };
      };
    };
  };
}>;

export function requireActor(actor: AuthenticatedActor | undefined): AuthenticatedActor {
  if (actor?.status !== 'ACTIVE') {
    throw new AppError(401, 'ACCOUNT_UNAVAILABLE', 'Account is unavailable');
  }
  return actor;
}

export function hasPermission(
  actor: AuthenticatedActor,
  input: { module: string; action: string; scope?: 'OWN' | 'BRANCH' | 'ALL'; branchId?: string },
) {
  return actor.roleAssignments.some((assignment) => {
    if (!assignment.role.isActive) return false;
    if (assignment.branchId && input.branchId && assignment.branchId !== input.branchId)
      return false;
    return assignment.role.rolePermissions.some(({ permission }) => {
      if (permission.module !== input.module || permission.action !== input.action) return false;
      if (permission.scope === 'ALL') return assignment.branchId === null;
      if (permission.scope === 'BRANCH')
        return Boolean(assignment.branchId) && assignment.branchId === input.branchId;
      return input.scope === 'OWN';
    });
  });
}

export function assertPermission(
  actor: AuthenticatedActor | undefined,
  input: { module: string; action: string; scope?: 'OWN' | 'BRANCH' | 'ALL'; branchId?: string },
) {
  const current = requireActor(actor);
  if (!hasPermission(current, input)) {
    throw new AppError(403, 'FORBIDDEN', `Permission denied for ${input.action} ${input.module}`);
  }
  return current;
}
