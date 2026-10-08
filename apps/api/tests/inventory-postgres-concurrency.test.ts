import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AuthenticatedActor } from '../src/modules/auth/authorization.js';

const databaseTestUrl = process.env.DATABASE_TEST_URL;
const databaseTestsRequested = process.env.RUN_DATABASE_TESTS === '1';
if (databaseTestsRequested && !databaseTestUrl)
  throw new Error('DATABASE_TEST_URL is required; PostgreSQL tests must not use DATABASE_URL');
const runDatabaseTests = Boolean(databaseTestUrl);

if (databaseTestUrl) process.env.DATABASE_URL = databaseTestUrl;

const loadInventoryService = () => import('../src/modules/inventory/inventory.service.js');
const loadPrisma = () => import('../src/database/prisma.js');

describe.skipIf(!runDatabaseTests)('Inventory unit concurrency with PostgreSQL', () => {
  let createUnit: Awaited<ReturnType<typeof loadInventoryService>>['createUnit'];
  let inspectUnit: Awaited<ReturnType<typeof loadInventoryService>>['inspectUnit'];
  let prisma: Awaited<ReturnType<typeof loadPrisma>>['prisma'];
  let branchId: string;
  let variantId: string;
  let modelId: string;
  let categoryId: string;
  const unitIds: string[] = [];
  const marker = randomUUID();
  const actor = {
    id: randomUUID(),
    status: 'ACTIVE' as const,
    employee: null,
    roleAssignments: [
      {
        branchId: null,
        branch: null,
        role: {
          isActive: true,
          roleCode: 'ADMIN',
          rolePermissions: [
            { permission: { module: 'inventory', action: 'read', scope: 'ALL' as const } },
            { permission: { module: 'inventory', action: 'manage', scope: 'ALL' as const } },
          ],
        },
      },
    ],
  } as unknown as AuthenticatedActor;

  beforeAll(async () => {
    ({ createUnit, inspectUnit } = await loadInventoryService());
    ({ prisma } = await loadPrisma());
    const branch = await prisma.branch.create({
      data: {
        branchCode: `IU-${marker}`.slice(0, 50),
        name: 'Inventory concurrency',
        address: 'Test only',
      },
    });
    branchId = branch.id;
    const category = await prisma.costumeCategory.create({ data: { name: `Inventory ${marker}` } });
    categoryId = category.id;
    const model = await prisma.costumeModel.create({
      data: { categoryId, modelCode: `IU-M-${marker}`.slice(0, 50), name: 'Inventory concurrency' },
    });
    modelId = model.id;
    const variant = await prisma.costumeVariant.create({
      data: {
        modelId,
        variantCode: `IU-V-${marker}`.slice(0, 50),
        sizeCode: 'M',
        colorCode: 'BLACK',
        dailyRentalPriceVnd: 100n,
        depositAmountVnd: 100n,
        replacementValueVnd: 200n,
      },
    });
    variantId = variant.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.unitEvent.deleteMany({ where: { unitId: { in: unitIds } } });
    await prisma.costumeUnit.deleteMany({ where: { id: { in: unitIds } } });
    if (variantId) await prisma.costumeVariant.deleteMany({ where: { id: variantId } });
    if (modelId) await prisma.costumeModel.deleteMany({ where: { id: modelId } });
    if (categoryId) await prisma.costumeCategory.deleteMany({ where: { id: categoryId } });
    if (branchId) await prisma.branch.deleteMany({ where: { id: branchId } });
    await prisma.$disconnect();
  });

  it('serializes simultaneous duplicate registration and keeps one acquisition event', async () => {
    const unitCode = `IU-${randomUUID()}`.toUpperCase();
    const results = await Promise.allSettled(
      [1, 2].map(() => createUnit(actor, { unitCode, branchId, variantId })),
    );
    const successful = results.filter((result) => result.status === 'fulfilled');
    expect(successful).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'UNIT_CODE_CONFLICT', statusCode: 409 },
    });
    const result = successful[0];
    if (result?.status !== 'fulfilled') throw new Error('Expected one created unit');
    unitIds.push(result.value.id);
    expect(await prisma.costumeUnit.count({ where: { unitCode } })).toBe(1);
    expect(
      await prisma.unitEvent.count({ where: { unitId: result.value.id, eventType: 'ACQUIRED' } }),
    ).toBe(1);
  });

  it('allows only one simultaneous inspection from INBOUND', async () => {
    const created = await createUnit(actor, {
      unitCode: `IU-${randomUUID()}`.toUpperCase(),
      branchId,
      variantId,
    });
    unitIds.push(created.id);
    const results = await Promise.allSettled([
      inspectUnit(actor, created.id, { conditionGrade: 'GOOD', nextStatus: 'READY' }),
      inspectUnit(actor, created.id, { conditionGrade: 'DAMAGED', nextStatus: 'REPAIR' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'INVALID_UNIT_TRANSITION', statusCode: 409 },
    });
    expect(
      await prisma.unitEvent.count({ where: { unitId: created.id, eventType: 'INSPECTED' } }),
    ).toBe(1);
  });
});
