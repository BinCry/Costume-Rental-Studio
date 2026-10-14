import { AppError } from '../../common/errors/app-error.js';
import type { Prisma } from '../../generated/prisma/client.js';

const invariantLockKey = 'costume-rental:global-admin-invariant';

export async function lockGlobalAdminInvariant(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${invariantLockKey}, 0))`;
}

async function countActiveGlobalAdmins(tx: Prisma.TransactionClient, userId?: string) {
  const targetUserId = userId ?? null;
  const rows = await tx.$queryRaw<{ count: number }[]>`
    SELECT COUNT(DISTINCT assignment.user_id)::int AS count
    FROM user_role_assignments assignment
    INNER JOIN roles role ON role.id = assignment.role_id
    INNER JOIN users account ON account.id = assignment.user_id
    INNER JOIN employees employee ON employee.user_id = assignment.user_id
    WHERE assignment.branch_id IS NULL
      AND (${targetUserId}::uuid IS NULL OR assignment.user_id = ${targetUserId}::uuid)
      AND role.role_code = 'ADMIN'
      AND role.actor_group = 'ADMIN'
      AND role.is_active = TRUE
      AND account.status = 'ACTIVE'
      AND employee.employment_status = 'ACTIVE'
      AND EXISTS (
        SELECT 1
        FROM role_permissions role_permission
        INNER JOIN permissions permission ON permission.id = role_permission.permission_id
        WHERE role_permission.role_id = role.id
          AND permission.code = 'rbac.manage.all'
          AND permission.module = 'rbac'
          AND permission.action = 'manage'
          AND permission.scope = 'ALL'
      )
      AND EXISTS (
        SELECT 1
        FROM role_permissions role_permission
        INNER JOIN permissions permission ON permission.id = role_permission.permission_id
        WHERE role_permission.role_id = role.id
          AND permission.code = 'staff.manage.all'
          AND permission.module = 'staff'
          AND permission.action = 'manage'
          AND permission.scope = 'ALL'
      )
  `;
  return Number(rows[0]?.count ?? 0);
}

export async function isActiveGlobalAdmin(tx: Prisma.TransactionClient, userId: string) {
  return (await countActiveGlobalAdmins(tx, userId)) > 0;
}

export async function assertActiveGlobalAdmin(tx: Prisma.TransactionClient) {
  if ((await countActiveGlobalAdmins(tx)) === 0) {
    throw new AppError(
      409,
      'ADMIN_LOCKOUT',
      'At least one active global administrator with RBAC and staff management permissions must remain',
    );
  }
}
