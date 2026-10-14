import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { AuthenticatedActor } from '../src/modules/auth/authorization.js';

const databaseTestUrl = process.env.DATABASE_TEST_URL;
const databaseTestsRequested = process.env.RUN_DATABASE_TESTS === '1';
if (databaseTestsRequested && !databaseTestUrl)
  throw new Error('DATABASE_TEST_URL is required; PostgreSQL tests must not use DATABASE_URL');
const runDatabaseTests = databaseTestsRequested && Boolean(databaseTestUrl);
if (databaseTestUrl) process.env.DATABASE_URL = databaseTestUrl;

const loadStaffService = () => import('../src/modules/staff/staff.service.js');
const loadCustomerService = () => import('../src/modules/customers/customer.service.js');
const loadRbacService = () => import('../src/modules/rbac/rbac.service.js');
const loadPrisma = () => import('../src/database/prisma.js');

type PrismaInstance = Awaited<ReturnType<typeof loadPrisma>>['prisma'];
const requiredAdminPermissions = [
  { code: 'rbac.manage.all', module: 'rbac', action: 'manage', scope: 'ALL' as const },
  { code: 'staff.manage.all', module: 'staff', action: 'manage', scope: 'ALL' as const },
];

describe.skipIf(!runDatabaseTests)('Global administrator lockout protection with PostgreSQL', () => {
  let prisma: PrismaInstance;
  let removeAssignment: Awaited<ReturnType<typeof loadStaffService>>['removeAssignment'];
  let terminateStaff: Awaited<ReturnType<typeof loadStaffService>>['terminateStaff'];
  let updateStaff: Awaited<ReturnType<typeof loadStaffService>>['updateStaff'];
  let setCustomerStatus: Awaited<ReturnType<typeof loadCustomerService>>['setCustomerStatus'];
  let replacePermissions: Awaited<ReturnType<typeof loadRbacService>>['replacePermissions'];
  let updateRole: Awaited<ReturnType<typeof loadRbacService>>['updateRole'];
  let adminRoleId = '';
  let createdAdminRole = false;
  let originalAdminRole: {
    id: string;
    actorGroup: 'ADMIN' | 'STAFF' | 'CUSTOMER';
    isActive: boolean;
  } | null = null;
  let originalAdminPermissionIds: string[] = [];
  let isolationBranchId: string | null = null;
  const isolatedAssignmentIds: string[] = [];
  const createdPermissionIds: string[] = [];
  const fixtureUserIds: string[] = [];

  beforeAll(async () => {
    ({ prisma } = await loadPrisma());
    ({ removeAssignment, terminateStaff, updateStaff } = await loadStaffService());
    ({ setCustomerStatus } = await loadCustomerService());
    ({ replacePermissions, updateRole } = await loadRbacService());

    const role = await prisma.role.findUnique({ where: { roleCode: 'ADMIN' } });
    if (role) {
      if (role.actorGroup !== 'ADMIN' || !role.isActive)
        throw new Error('The ADMIN role must be active and in the ADMIN actor group for this test');
      adminRoleId = role.id;
      originalAdminRole = role;
      originalAdminPermissionIds = (
        await prisma.rolePermission.findMany({
          where: { roleId: role.id },
          select: { permissionId: true },
        })
      ).map(({ permissionId }) => permissionId);
    } else {
      const created = await prisma.role.create({
        data: { roleCode: 'ADMIN', name: 'Test administrator', actorGroup: 'ADMIN', isActive: true },
      });
      adminRoleId = created.id;
      createdAdminRole = true;
    }

    for (const definition of requiredAdminPermissions) {
      let permission = await prisma.permission.findUnique({ where: { code: definition.code } });
      if (!permission) {
        permission = await prisma.permission.create({ data: definition });
        createdPermissionIds.push(permission.id);
      }
      if (
        permission.module !== definition.module ||
        permission.action !== definition.action ||
        permission.scope !== definition.scope
      )
        throw new Error(`Permission ${definition.code} has unexpected metadata`);

      const link = await prisma.rolePermission.findUnique({
        where: { roleId_permissionId: { roleId: adminRoleId, permissionId: permission.id } },
      });
      if (!link)
        await prisma.rolePermission.create({
          data: { roleId: adminRoleId, permissionId: permission.id },
        });
    }

    await isolatePreexistingGlobalAdmins();
    const remainingGlobalAdmins = await activeAdminCount();
    if (remainingGlobalAdmins !== 0)
      throw new Error('Could not isolate existing global administrators in the disposable test database');
  });

  afterEach(async () => {
    if (fixtureUserIds.length > 0) await deleteFixtures([...fixtureUserIds]);
  });

  afterAll(async () => {
    if (!prisma) return;
    const cleanupErrors: string[] = [];
    const attemptCleanup = async (label: string, action: () => Promise<unknown>) => {
      try {
        await action();
        return true;
      } catch (error) {
        cleanupErrors.push(`${label}: ${String(error)}`);
        return false;
      }
    };

    if (fixtureUserIds.length > 0)
      await attemptCleanup('Remove test users', () => deleteFixtures([...fixtureUserIds]));
    let assignmentsRestored = isolatedAssignmentIds.length === 0;
    if (isolatedAssignmentIds.length > 0 && isolationBranchId) {
      assignmentsRestored = await attemptCleanup('Restore global admin assignments', async () => {
        const result = await prisma.userRoleAssignment.updateMany({
          where: { id: { in: isolatedAssignmentIds }, branchId: isolationBranchId },
          data: { branchId: null },
        });
        if (result.count !== isolatedAssignmentIds.length)
          throw new Error('Not all isolated global admin assignments were restored');
      });
    }
    let roleRestored = !originalAdminRole;
    if (originalAdminRole)
      roleRestored = await attemptCleanup('Restore ADMIN role', async () => {
        await prisma.$transaction(async (tx) => {
          await tx.role.update({
            where: { id: originalAdminRole!.id },
            data: { actorGroup: originalAdminRole!.actorGroup, isActive: originalAdminRole!.isActive },
          });
          await tx.rolePermission.deleteMany({ where: { roleId: originalAdminRole!.id } });
          if (originalAdminPermissionIds.length)
            await tx.rolePermission.createMany({
              data: originalAdminPermissionIds.map((permissionId) => ({
                roleId: originalAdminRole!.id,
                permissionId,
              })),
            });
        });
      });
    else if (createdAdminRole)
      await attemptCleanup('Remove test ADMIN role', async () => {
        await prisma.role.deleteMany({ where: { id: adminRoleId } });
      });
    if (createdPermissionIds.length && (roleRestored || createdAdminRole))
      await attemptCleanup('Remove test permissions', async () => {
        await prisma.permission.deleteMany({ where: { id: { in: createdPermissionIds } } });
      });
    if (isolationBranchId && assignmentsRestored)
      await attemptCleanup('Remove isolation branch', async () => {
        await prisma.branch.deleteMany({ where: { id: isolationBranchId } });
      });
    await attemptCleanup('Disconnect PostgreSQL test client', async () => {
      await prisma.$disconnect();
    });
    if (cleanupErrors.length) throw new Error(cleanupErrors.join('\n'));
  });

  async function isolatePreexistingGlobalAdmins() {
    const assignments = await prisma.userRoleAssignment.findMany({
      where: { branchId: null, roleId: adminRoleId },
      include: {
        user: { include: { employee: true } },
        role: { include: { rolePermissions: { include: { permission: true } } } },
      },
    });
    const eligibleAssignmentIds = assignments
      .filter(({ user, role }) =>
        user.status === 'ACTIVE' &&
        user.employee?.employmentStatus === 'ACTIVE' &&
        role.isActive &&
        role.actorGroup === 'ADMIN' &&
        requiredAdminPermissions.every((required) =>
          role.rolePermissions.some(
            ({ permission }) =>
              permission.code === required.code &&
              permission.module === required.module &&
              permission.action === required.action &&
              permission.scope === required.scope,
          ),
        ),
      )
      .map(({ id }) => id);
    if (eligibleAssignmentIds.length === 0) return;

    const marker = randomUUID().toUpperCase();
    const branch = await prisma.branch.create({
      data: {
        branchCode: `ADM-${marker}`,
        name: 'Admin invariant test isolation',
        address: 'Disposable PostgreSQL test fixture',
      },
    });
    isolationBranchId = branch.id;
    isolatedAssignmentIds.push(...eligibleAssignmentIds);
    const moved = await prisma.userRoleAssignment.updateMany({
      where: { id: { in: eligibleAssignmentIds }, branchId: null },
      data: { branchId: branch.id },
    });
    if (moved.count !== eligibleAssignmentIds.length) {
      const restored = await prisma.userRoleAssignment.updateMany({
        where: { id: { in: eligibleAssignmentIds }, branchId: branch.id },
        data: { branchId: null },
      });
      if (restored.count === eligibleAssignmentIds.length) {
        await prisma.branch.delete({ where: { id: branch.id } });
        isolationBranchId = null;
      }
      throw new Error('Could not isolate every pre-existing global ADMIN assignment');
    }
  }

  async function deleteFixtures(userIds: string[]) {
    if (userIds.length === 0) return;
    await prisma.userRoleAssignment.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.customer.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.employee.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.refreshSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    for (const userId of userIds) {
      const index = fixtureUserIds.indexOf(userId);
      if (index >= 0) fixtureUserIds.splice(index, 1);
    }
  }

  async function createAdmin() {
    const marker = randomUUID().toUpperCase();
    const user = await prisma.user.create({
      data: {
        email: `admin-${marker}@example.test`,
        displayName: 'Administrator test',
        status: 'ACTIVE',
      },
    });
    fixtureUserIds.push(user.id);
    await prisma.employee.create({
      data: {
        userId: user.id,
        employeeCode: `EMP-${marker}`,
        joinedAt: new Date('2025-01-01T00:00:00.000Z'),
        createdBy: user.id,
        employmentStatus: 'ACTIVE',
      },
    });
    await prisma.customer.create({
      data: { userId: user.id, customerCode: `CUS-${marker}` },
    });
    const assignment = await prisma.userRoleAssignment.create({
      data: { userId: user.id, roleId: adminRoleId, branchId: null, assignedBy: user.id },
    });
    return { user, assignment };
  }

  function actorFor(id: string) {
    return {
      id,
      status: 'ACTIVE',
      employee: { employmentStatus: 'ACTIVE' },
      roleAssignments: [
        {
          branchId: null,
          branch: null,
          role: {
            isActive: true,
            roleCode: 'ADMIN',
            actorGroup: 'ADMIN',
            rolePermissions: [
              ...requiredAdminPermissions.map(({ module, action, scope }) => ({
                permission: { module, action, scope },
              })),
              { permission: { module: 'customers', action: 'update', scope: 'ALL' } },
            ],
          },
        },
      ],
    } as unknown as AuthenticatedActor;
  }

  async function activeAdminCount() {
    const assignments = await prisma.userRoleAssignment.findMany({
      where: { branchId: null, roleId: adminRoleId },
      include: {
        user: { include: { employee: true } },
        role: { include: { rolePermissions: { include: { permission: true } } } },
      },
    });
    return assignments.filter(({ user, role }) =>
      user.status === 'ACTIVE' &&
      user.employee?.employmentStatus === 'ACTIVE' &&
      role.isActive &&
      role.actorGroup === 'ADMIN' &&
      requiredAdminPermissions.every((required) =>
        role.rolePermissions.some(
          ({ permission }) =>
            permission.code === required.code &&
            permission.module === required.module &&
            permission.action === required.action &&
            permission.scope === required.scope,
        ),
      ),
    ).length;
  }

  it('blocks self-removal and preserves the only eligible global administrator', async () => {
    const admin = await createAdmin();

    await expect(
      removeAssignment(actorFor(admin.user.id), admin.user.id, admin.assignment.id),
    ).rejects.toMatchObject({ code: 'SELF_ADMIN_ASSIGNMENT_REMOVAL' });
    await expect(
      removeAssignment(actorFor(randomUUID()), admin.user.id, admin.assignment.id),
    ).rejects.toMatchObject({ code: 'ADMIN_LOCKOUT' });
    expect(await activeAdminCount()).toBe(1);
  });

  it('protects the only administrator through account and RBAC mutations', async () => {
    const operations = [
      async (userId: string) => terminateStaff(actorFor(randomUUID()), userId),
      async (userId: string) => updateStaff(actorFor(randomUUID()), userId, { employmentStatus: 'ON_LEAVE' }),
      async (userId: string) => setCustomerStatus(actorFor(randomUUID()), userId, 'INACTIVE'),
    ];
    for (const operation of operations) {
      const admin = await createAdmin();
      await expect(operation(admin.user.id)).rejects.toMatchObject({ code: 'ADMIN_LOCKOUT' });
      expect(await activeAdminCount()).toBe(1);
      await deleteFixtures([admin.user.id]);
    }

    const admin = await createAdmin();
    const rbacPermission = await prisma.permission.findUniqueOrThrow({
      where: { code: 'rbac.manage.all' },
    });
    await expect(
      replacePermissions(actorFor(randomUUID()), adminRoleId, [rbacPermission.id]),
    ).rejects.toMatchObject({ code: 'ADMIN_LOCKOUT' });
    await expect(
      updateRole(actorFor(randomUUID()), adminRoleId, { actorGroup: 'STAFF' }),
    ).rejects.toMatchObject({ code: 'ADMIN_LOCKOUT' });
    expect(await activeAdminCount()).toBe(1);
  });

  it('serializes concurrent removal attempts so one eligible global administrator remains', async () => {
    const [first, second] = await Promise.all([createAdmin(), createAdmin()]);

    const results = await Promise.allSettled([
      removeAssignment(actorFor(first.user.id), second.user.id, second.assignment.id),
      removeAssignment(actorFor(second.user.id), first.user.id, first.assignment.id),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await activeAdminCount()).toBe(1);
  });
});
