import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { AuthenticatedActor } from '../src/modules/auth/authorization.js';

const databaseTestUrl = process.env.DATABASE_TEST_URL;
const databaseTestsRequested = process.env.RUN_DATABASE_TESTS === '1';
if (databaseTestsRequested && !databaseTestUrl)
  throw new Error('DATABASE_TEST_URL is required; PostgreSQL tests must not use DATABASE_URL');
const runDatabaseTests = Boolean(databaseTestUrl);
if (databaseTestUrl) process.env.DATABASE_URL = databaseTestUrl;

const loadBranchService = () => import('../src/modules/branches/branch.service.js');
const loadStaffService = () => import('../src/modules/staff/staff.service.js');
const loadPrisma = () => import('../src/database/prisma.js');

describe.skipIf(!runDatabaseTests)('Branch concurrency with PostgreSQL', () => {
  let prisma: Awaited<ReturnType<typeof loadPrisma>>['prisma'];
  let setBranchStatus: Awaited<ReturnType<typeof loadBranchService>>['setBranchStatus'];
  let deleteBranch: Awaited<ReturnType<typeof loadBranchService>>['deleteBranch'];
  let assignRole: Awaited<ReturnType<typeof loadStaffService>>['assignRole'];
  const branchIds: string[] = [];
  const roleIds: string[] = [];
  const userIds: string[] = [];

  const actor = {
    id: '',
    status: 'ACTIVE',
    employee: { employmentStatus: 'ACTIVE' },
    roleAssignments: [
      {
        branchId: null,
        branch: null,
        role: {
          isActive: true,
          roleCode: 'ADMIN',
          rolePermissions: [
            { permission: { module: 'branches', action: 'manage', scope: 'ALL' } },
            { permission: { module: 'staff', action: 'manage', scope: 'ALL' } },
          ],
        },
      },
    ],
  } as unknown as AuthenticatedActor;

  beforeAll(async () => {
    ({ prisma } = await loadPrisma());
    ({ setBranchStatus, deleteBranch } = await loadBranchService());
    ({ assignRole } = await loadStaffService());
  });

  afterEach(async () => {
    await prisma.userRoleAssignment.deleteMany({ where: { branchId: { in: branchIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.branch.deleteMany({ where: { id: { in: branchIds } } });
    branchIds.length = 0;
    roleIds.length = 0;
    userIds.length = 0;
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  async function fixture() {
    const marker = randomUUID();
    const branch = await prisma.branch.create({
      data: {
        branchCode: `BR-${marker}`.toUpperCase(),
        name: `Branch ${marker}`,
        address: 'Test address',
      },
    });
    branchIds.push(branch.id);
    const actorUser = await prisma.user.create({
      data: { email: `actor-${marker}@example.test`, displayName: 'Actor', status: 'ACTIVE' },
    });
    const targetUser = await prisma.user.create({
      data: { email: `target-${marker}@example.test`, displayName: 'Target', status: 'ACTIVE' },
    });
    userIds.push(actorUser.id, targetUser.id);
    const role = await prisma.role.create({
      data: { roleCode: `STAFF-${marker}`.toUpperCase(), name: 'Test staff', actorGroup: 'STAFF' },
    });
    roleIds.push(role.id);
    (actor as { id: string }).id = actorUser.id;
    return { branch, role, targetUser };
  }

  it('serializes deactivate against a concurrent branch role assignment', async () => {
    const { branch, role, targetUser } = await fixture();
    const results = await Promise.allSettled([
      assignRole(actor, targetUser.id, { roleId: role.id, branchId: branch.id }),
      setBranchStatus(actor, branch.id, 'INACTIVE'),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const [storedBranch, assignmentCount] = await Promise.all([
      prisma.branch.findUniqueOrThrow({ where: { id: branch.id } }),
      prisma.userRoleAssignment.count({ where: { branchId: branch.id } }),
    ]);
    expect(
      (storedBranch.status === 'ACTIVE' && assignmentCount === 1) ||
        (storedBranch.status === 'INACTIVE' && assignmentCount === 0),
    ).toBe(true);
  });

  it('serializes delete against a concurrent branch role assignment', async () => {
    const { branch, role, targetUser } = await fixture();
    const results = await Promise.allSettled([
      assignRole(actor, targetUser.id, { roleId: role.id, branchId: branch.id }),
      deleteBranch(actor, branch.id),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const storedBranch = await prisma.branch.findUnique({ where: { id: branch.id } });
    const assignmentCount = await prisma.userRoleAssignment.count({
      where: { branchId: branch.id },
    });
    expect(
      (storedBranch?.status === 'ACTIVE' && assignmentCount === 1) ||
        (storedBranch === null && assignmentCount === 0),
    ).toBe(true);
  });
});
