import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AuthenticatedActor } from '../src/modules/auth/authorization.js';

const databaseTestUrl = process.env.DATABASE_TEST_URL;
if (process.env.RUN_DATABASE_TESTS === '1' && !databaseTestUrl)
  throw new Error('DATABASE_TEST_URL is required; PostgreSQL tests must not use DATABASE_URL');
const runDatabaseTests = Boolean(databaseTestUrl);
if (databaseTestUrl) process.env.DATABASE_URL = databaseTestUrl;

const loadTransfers = () => import('../src/modules/transfers/transfer.service.js');
const loadPrisma = () => import('../src/database/prisma.js');

describe.skipIf(!runDatabaseTests)('Stock transfer concurrency with PostgreSQL', () => {
  let createTransfer: Awaited<ReturnType<typeof loadTransfers>>['createTransfer'];
  let approveTransfer: Awaited<ReturnType<typeof loadTransfers>>['approveTransfer'];
  let endTransfer: Awaited<ReturnType<typeof loadTransfers>>['endTransfer'];
  let prisma: Awaited<ReturnType<typeof loadPrisma>>['prisma'];
  const marker = randomUUID();
  let sourceBranchId: string;
  let destinationBranchId: string;
  let categoryId: string;
  let modelId: string;
  let variantId: string;
  let userId: string;
  const unitIds: string[] = [];
  const transferIds: string[] = [];
  const actor = {
    id: '',
    status: 'ACTIVE' as const,
    employee: { employmentStatus: 'ACTIVE' },
    roleAssignments: [
      {
        branchId: null,
        branch: null,
        role: {
          isActive: true,
          roleCode: 'ADMIN',
          rolePermissions: [
            { permission: { module: 'transfers', action: 'read', scope: 'ALL' as const } },
            { permission: { module: 'transfers', action: 'manage', scope: 'ALL' as const } },
          ],
        },
      },
    ],
  } as unknown as AuthenticatedActor;

  async function createReadyUnit() {
    const unit = await prisma.costumeUnit.create({
      data: {
        unitCode: `TRF-U-${randomUUID()}`.toUpperCase().slice(0, 50),
        variantId,
        currentBranchId: sourceBranchId,
        conditionGrade: 'GOOD',
        operationalStatus: 'READY',
      },
    });
    unitIds.push(unit.id);
    return unit;
  }

  beforeAll(async () => {
    ({ createTransfer, approveTransfer, endTransfer } = await loadTransfers());
    ({ prisma } = await loadPrisma());
    const branches = await Promise.all(
      ['Source', 'Destination'].map((name, index) =>
        prisma.branch.create({
          data: { branchCode: `TRF-${index}-${marker}`.slice(0, 50), name, address: 'Test only' },
        }),
      ),
    );
    const source = branches[0];
    const destination = branches[1];
    if (!source || !destination) throw new Error('Expected two transfer branches');
    sourceBranchId = source.id;
    destinationBranchId = destination.id;
    const category = await prisma.costumeCategory.create({ data: { name: `Transfer ${marker}` } });
    categoryId = category.id;
    const model = await prisma.costumeModel.create({
      data: { categoryId, modelCode: `TRF-M-${marker}`.slice(0, 50), name: 'Transfer test' },
    });
    modelId = model.id;
    const variant = await prisma.costumeVariant.create({
      data: {
        modelId,
        variantCode: `TRF-V-${marker}`.slice(0, 50),
        sizeCode: 'M',
        colorCode: 'BLACK',
        dailyRentalPriceVnd: 100n,
        depositAmountVnd: 100n,
        replacementValueVnd: 200n,
      },
    });
    variantId = variant.id;
    const user = await prisma.user.create({
      data: {
        email: `transfer-${marker}@test.local`,
        displayName: 'Transfer tester',
        status: 'ACTIVE',
      },
    });
    userId = user.id;
    actor.id = userId;
    await prisma.employee.create({
      data: {
        userId,
        employeeCode: `TRF-E-${marker}`.slice(0, 50),
        joinedAt: new Date(),
        createdBy: userId,
      },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.unitEvent.deleteMany({ where: { unitId: { in: unitIds } } });
    await prisma.stockTransfer.deleteMany({ where: { id: { in: transferIds } } });
    await prisma.costumeUnit.deleteMany({ where: { id: { in: unitIds } } });
    if (variantId) await prisma.costumeVariant.deleteMany({ where: { id: variantId } });
    if (modelId) await prisma.costumeModel.deleteMany({ where: { id: modelId } });
    if (categoryId) await prisma.costumeCategory.deleteMany({ where: { id: categoryId } });
    if (userId) {
      await prisma.employee.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    if (sourceBranchId) await prisma.branch.deleteMany({ where: { id: sourceBranchId } });
    if (destinationBranchId) await prisma.branch.deleteMany({ where: { id: destinationBranchId } });
    await prisma.$disconnect();
  });

  it('reserves a unit so only one simultaneous request succeeds', async () => {
    const unit = await createReadyUnit();
    const attempts = await Promise.allSettled(
      [1, 2].map(() =>
        createTransfer(actor, {
          fromBranchId: sourceBranchId,
          toBranchId: destinationBranchId,
          unitIds: [unit.id],
        }),
      ),
    );
    const successful = attempts.filter((attempt) => attempt.status === 'fulfilled');
    expect(successful).toHaveLength(1);
    const result = successful[0];
    if (result?.status !== 'fulfilled') throw new Error('Expected a transfer');
    transferIds.push(result.value.id);
    expect(
      await prisma.stockTransferItem.count({
        where: { unitId: unit.id, transfer: { status: 'REQUESTED' } },
      }),
    ).toBe(1);
    expect(attempts.find((attempt) => attempt.status === 'rejected')).toMatchObject({
      reason: { code: 'UNIT_UNAVAILABLE', statusCode: 409 },
    });
  });

  it('serializes approve versus cancel using the transfer version and row lock', async () => {
    const unit = await createReadyUnit();
    const transfer = await createTransfer(actor, {
      fromBranchId: sourceBranchId,
      toBranchId: destinationBranchId,
      unitIds: [unit.id],
    });
    transferIds.push(transfer.id);
    const attempts = await Promise.allSettled([
      approveTransfer(actor, transfer.id, { expectedVersion: 1 }),
      endTransfer(actor, transfer.id, 'CANCELLED', { expectedVersion: 1, reason: 'Changed plan' }),
    ]);
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.find((attempt) => attempt.status === 'rejected')).toMatchObject({
      reason: { statusCode: 409 },
    });
    const stored = await prisma.stockTransfer.findUniqueOrThrow({ where: { id: transfer.id } });
    expect(['APPROVED', 'CANCELLED']).toContain(stored.status);
    expect(stored.version).toBe(2);
  });
});
