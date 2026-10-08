import { AppError } from '../../common/errors/app-error.js';
import type { Prisma } from '../../generated/prisma/client.js';

export const authenticatedActorSelect = {
  id: true,
  email: true,
  phone: true,
  displayName: true,
  avatarUrl: true,
  emailVerifiedAt: true,
  status: true,
  employee: {
    select: {
      employmentStatus: true,
    },
  },
  roleAssignments: {
    select: {
      branchId: true,
      branch: {
        select: {
          status: true,
        },
      },
      role: {
        select: {
          roleCode: true,
          name: true,
          actorGroup: true,
          isActive: true,
          rolePermissions: {
            select: {
              permission: {
                select: {
                  code: true,
                  module: true,
                  action: true,
                  scope: true,
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.UserSelect;

export type AuthenticatedActor = Prisma.UserGetPayload<{
  select: typeof authenticatedActorSelect;
}>;

export function requireActor(actor: AuthenticatedActor | undefined): AuthenticatedActor {
  if (
    actor?.status !== 'ACTIVE' ||
    (actor.employee && actor.employee.employmentStatus !== 'ACTIVE')
  ) {
    throw new AppError(401, 'ACCOUNT_UNAVAILABLE', 'Account is unavailable');
  }
  return actor;
}

export function hasPermission(
  actor: AuthenticatedActor,
  input: { module: string; action: string; scope?: 'OWN' | 'BRANCH' | 'ALL'; branchId?: string },
) {
  if (actor.status !== 'ACTIVE' || (actor.employee && actor.employee.employmentStatus !== 'ACTIVE'))
    return false;
  return actor.roleAssignments.some((assignment) => {
    if (!assignment.role.isActive) return false;
    if (assignment.branchId && assignment.branch?.status !== 'ACTIVE') return false;
    if (assignment.branchId && input.branchId && assignment.branchId !== input.branchId)
      return false;
    return assignment.role.rolePermissions.some(({ permission }) => {
      if (permission.module !== input.module || permission.action !== input.action) return false;
      if (permission.scope === 'ALL') {
        // Catalog data is shared across branches, including for branch-bound staff.
        return (
          assignment.branchId === null ||
          (permission.module === 'catalog' && permission.action === 'read')
        );
      }
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
