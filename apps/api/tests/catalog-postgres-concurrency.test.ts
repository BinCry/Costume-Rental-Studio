import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { AuthenticatedActor } from '../src/modules/auth/authorization.js';

const databaseTestUrl = process.env.DATABASE_TEST_URL;
const databaseTestsRequested = process.env.RUN_DATABASE_TESTS === '1';
if (databaseTestsRequested && !databaseTestUrl)
  throw new Error('DATABASE_TEST_URL is required; PostgreSQL tests must not use DATABASE_URL');
const runDatabaseTests = Boolean(databaseTestUrl);

if (databaseTestUrl) process.env.DATABASE_URL = databaseTestUrl;

vi.mock('../src/common/storage/s3.js', () => ({
  deleteStoredObject: vi.fn().mockResolvedValue(undefined),
  imageContentTypeForKey: (key: string) => (key.endsWith('.jpg') ? 'image/jpeg' : undefined),
  promoteStoredImage: vi.fn().mockResolvedValue(undefined),
  publicObjectUrl: () => undefined,
}));

const loadCatalogService = () => import('../src/modules/catalog/catalog.service.js');
const loadEnv = () => import('../src/config/env.js');
const loadPrisma = () => import('../src/database/prisma.js');

describe.skipIf(!runDatabaseTests)('Catalog media concurrency with PostgreSQL', () => {
  let createMedia: Awaited<ReturnType<typeof loadCatalogService>>['createMedia'];
  let createCategory: Awaited<ReturnType<typeof loadCatalogService>>['createCategory'];
  let createCatalogModel: Awaited<ReturnType<typeof loadCatalogService>>['createModel'];
  let deleteAccessory: Awaited<ReturnType<typeof loadCatalogService>>['deleteAccessory'];
  let deleteCategory: Awaited<ReturnType<typeof loadCatalogService>>['deleteCategory'];
  let deleteModel: Awaited<ReturnType<typeof loadCatalogService>>['deleteModel'];
  let deleteVariant: Awaited<ReturnType<typeof loadCatalogService>>['deleteVariant'];
  let setCategoryStatus: Awaited<ReturnType<typeof loadCatalogService>>['setCategoryStatus'];
  let setModelStatus: Awaited<ReturnType<typeof loadCatalogService>>['setModelStatus'];
  let env: Awaited<ReturnType<typeof loadEnv>>['env'];
  let prisma: Awaited<ReturnType<typeof loadPrisma>>['prisma'];
  let categoryId: string;
  const modelIds: string[] = [];
  const descendantCategoryIds: string[] = [];
  const actor = {
    id: randomUUID(),
    status: 'ACTIVE' as const,
    employee: { employmentStatus: 'ACTIVE' as const },
    roleAssignments: [
      {
        branchId: null,
        branch: null,
        role: {
          isActive: true,
          roleCode: 'ADMIN',
          rolePermissions: [
            { permission: { module: 'catalog', action: 'manage', scope: 'ALL' as const } },
          ],
        },
      },
    ],
  } as unknown as AuthenticatedActor;

  beforeAll(async () => {
    ({
      createCategory,
      createMedia,
      createModel: createCatalogModel,
      deleteAccessory,
      deleteCategory,
      deleteModel,
      deleteVariant,
      setCategoryStatus,
      setModelStatus,
    } = await loadCatalogService());
    ({ env } = await loadEnv());
    ({ prisma } = await loadPrisma());
    const category = await prisma.costumeCategory.create({
      data: { name: `Concurrency ${randomUUID()}` },
    });
    categoryId = category.id;
  });

  afterEach(async () => {
    await prisma.costumeMedia.deleteMany({ where: { modelId: { in: modelIds } } });
    await prisma.costumeVariant.deleteMany({ where: { modelId: { in: modelIds } } });
    await prisma.costumeModel.deleteMany({ where: { id: { in: modelIds } } });
    modelIds.length = 0;
    for (const id of descendantCategoryIds.reverse())
      await prisma.costumeCategory.delete({ where: { id } });
    descendantCategoryIds.length = 0;
  });

  afterAll(async () => {
    if (prisma) {
      if (categoryId) await prisma.costumeCategory.delete({ where: { id: categoryId } });
      await prisma.$disconnect();
    }
  });

  async function createModel() {
    const marker = randomUUID();
    const model = await prisma.costumeModel.create({
      data: {
        categoryId,
        modelCode: `CONC-${marker}`,
        name: `Concurrency ${marker}`,
      },
    });
    modelIds.push(model.id);
    return model;
  }

  it('enforces the model image limit across simultaneous finalizations', async () => {
    const model = await createModel();
    await prisma.costumeMedia.createMany({
      data: Array.from({ length: env.MEDIA_MAX_MODEL_IMAGES - 1 }, (_, index) => ({
        modelId: model.id,
        objectKey: `catalog/models/${model.id}/existing-${index}.jpg`,
      })),
    });

    const results = await Promise.allSettled(
      [randomUUID(), randomUUID()].map((uploadId) =>
        createMedia(
          actor,
          { modelId: model.id },
          { uploadKey: `catalog-staging/models/${model.id}/${uploadId}.jpg`, sortOrder: 0 },
        ),
      ),
    );

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await prisma.costumeMedia.count({ where: { modelId: model.id } })).toBe(
      env.MEDIA_MAX_MODEL_IMAGES,
    );
    const rejection = results.find((result) => result.status === 'rejected');
    expect(rejection).toMatchObject({ reason: { code: 'MEDIA_LIMIT_REACHED', statusCode: 409 } });
  });

  it('registers the same staging upload only once across simultaneous finalizations', async () => {
    const model = await createModel();
    const uploadKey = `catalog-staging/models/${model.id}/${randomUUID()}.jpg`;

    const results = await Promise.allSettled(
      [1, 2].map(() => createMedia(actor, { modelId: model.id }, { uploadKey, sortOrder: 0 })),
    );

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await prisma.costumeMedia.count({ where: { modelId: model.id } })).toBe(1);
    expect(await prisma.costumeMedia.count({ where: { sourceUploadKey: uploadKey } })).toBe(1);
    const rejection = results.find((result) => result.status === 'rejected');
    expect(rejection).toMatchObject({
      reason: { code: 'MEDIA_ALREADY_REGISTERED', statusCode: 409 },
    });
  });

  it('atomically deactivates the complete category subtree', async () => {
    const child = await prisma.costumeCategory.create({
      data: { name: `Child ${randomUUID()}`, parentId: categoryId },
    });
    descendantCategoryIds.push(child.id);
    const grandchild = await prisma.costumeCategory.create({
      data: { name: `Grandchild ${randomUUID()}`, parentId: child.id },
    });
    descendantCategoryIds.push(grandchild.id);
    const marker = randomUUID();
    const model = await prisma.costumeModel.create({
      data: {
        categoryId: grandchild.id,
        modelCode: `TREE-${marker}`,
        name: `Tree ${marker}`,
        accessories: { create: { name: 'Included accessory' } },
        variants: {
          create: {
            variantCode: `TREE-V-${marker}`,
            sizeCode: 'M',
            colorCode: 'RED',
            dailyRentalPriceVnd: 100n,
            depositAmountVnd: 100n,
            replacementValueVnd: 200n,
          },
        },
      },
    });
    modelIds.push(model.id);

    await setCategoryStatus(actor, categoryId, 'INACTIVE');

    expect(
      await prisma.costumeCategory.count({
        where: { id: { in: [categoryId, child.id, grandchild.id] }, status: 'INACTIVE' },
      }),
    ).toBe(3);
    expect(await prisma.costumeModel.count({ where: { id: model.id, status: 'INACTIVE' } })).toBe(
      1,
    );
    expect(
      await prisma.costumeVariant.count({ where: { modelId: model.id, status: 'INACTIVE' } }),
    ).toBe(1);
    expect(
      await prisma.costumeModelAccessory.count({
        where: { modelId: model.id, isActive: false },
      }),
    ).toBe(1);

    await setCategoryStatus(actor, categoryId, 'ACTIVE');
    expect(
      await prisma.costumeCategory.count({
        where: { id: { in: [child.id, grandchild.id] }, status: 'INACTIVE' },
      }),
    ).toBe(2);
    expect(await prisma.costumeModel.count({ where: { id: model.id, status: 'INACTIVE' } })).toBe(
      1,
    );
  });

  it('rejects a descendant created concurrently with parent deactivation', async () => {
    let releaseLock!: () => void;
    let reportLocked!: () => void;
    const locked = new Promise<void>((resolve) => {
      reportLocked = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const blocker = prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT id FROM costume_categories WHERE id = ${categoryId}::uuid FOR UPDATE
      `;
      reportLocked();
      await release;
      await transaction.costumeCategory.update({
        where: { id: categoryId },
        data: { status: 'INACTIVE' },
      });
    });
    await locked;
    const marker = randomUUID();
    const concurrentCreate = createCatalogModel(actor, {
      categoryId,
      modelCode: `RACE-${marker}`,
      name: `Race ${marker}`,
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    releaseLock();
    await blocker;

    await expect(concurrentCreate).rejects.toMatchObject({
      code: 'INVALID_CATEGORY',
      statusCode: 400,
    });
    expect(await prisma.costumeModel.count({ where: { modelCode: `RACE-${marker}` } })).toBe(0);
    await prisma.costumeCategory.update({
      where: { id: categoryId },
      data: { status: 'ACTIVE' },
    });
  });

  it('serializes subtree cascade with category creation below a descendant', async () => {
    const child = await prisma.costumeCategory.create({
      data: { name: `Race child ${randomUUID()}`, parentId: categoryId },
    });
    descendantCategoryIds.push(child.id);
    let releaseRow!: () => void;
    let reportRowLocked!: () => void;
    const rowLocked = new Promise<void>((resolve) => {
      reportRowLocked = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseRow = resolve;
    });
    const blocker = prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT id FROM costume_categories WHERE id = ${child.id}::uuid FOR UPDATE
      `;
      reportRowLocked();
      await release;
    });
    await rowLocked;

    const cascade = setCategoryStatus(actor, categoryId, 'INACTIVE');
    let cascadeOwnsHierarchyLock = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      const rows = await prisma.$transaction(
        (transaction) =>
          transaction.$queryRaw<{ acquired: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(112835284, 1) AS acquired
        `,
      );
      if (rows[0]?.acquired === false) {
        cascadeOwnsHierarchyLock = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(cascadeOwnsHierarchyLock).toBe(true);
    const concurrentCreate = createCategory(actor, {
      parentId: child.id,
      name: `Blocked grandchild ${randomUUID()}`,
    });
    releaseRow();
    await blocker;
    await cascade;

    await expect(concurrentCreate).rejects.toMatchObject({
      code: 'INVALID_PARENT',
      statusCode: 400,
    });
    expect(await prisma.costumeCategory.count({ where: { parentId: child.id } })).toBe(0);
    await prisma.costumeCategory.update({
      where: { id: categoryId },
      data: { status: 'ACTIVE' },
    });
  });

  it('rechecks a moved model current category before activation', async () => {
    const destination = await prisma.costumeCategory.create({
      data: { name: `Move destination ${randomUUID()}`, parentId: categoryId },
    });
    descendantCategoryIds.push(destination.id);
    const marker = randomUUID();
    const model = await prisma.costumeModel.create({
      data: {
        categoryId,
        modelCode: `MOVE-${marker}`,
        name: `Move ${marker}`,
        status: 'INACTIVE',
      },
    });
    modelIds.push(model.id);
    let releaseLock!: () => void;
    let reportLocked!: () => void;
    const locked = new Promise<void>((resolve) => {
      reportLocked = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const mover = prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw<{ lock: string }[]>`
        SELECT pg_advisory_xact_lock(112835284, 1)::text AS lock
      `;
      reportLocked();
      await release;
      await transaction.costumeModel.update({
        where: { id: model.id },
        data: { categoryId: destination.id },
      });
      await transaction.costumeCategory.update({
        where: { id: destination.id },
        data: { status: 'INACTIVE' },
      });
    });
    await locked;
    const activation = setModelStatus(actor, model.id, 'ACTIVE');
    await new Promise((resolve) => setTimeout(resolve, 100));
    releaseLock();
    await mover;

    await expect(activation).rejects.toMatchObject({
      code: 'INVALID_CATEGORY',
      statusCode: 400,
    });
    expect(
      await prisma.costumeModel.count({
        where: { id: model.id, categoryId: destination.id, status: 'INACTIVE' },
      }),
    ).toBe(1);
  });

  it('serializes category deletion with concurrent child creation', async () => {
    const parent = await prisma.costumeCategory.create({
      data: { name: `Delete race parent ${randomUUID()}`, parentId: categoryId },
    });
    descendantCategoryIds.push(parent.id);

    const [deletion, creation] = await Promise.allSettled([
      deleteCategory(actor, parent.id),
      createCategory(actor, {
        parentId: parent.id,
        name: `Delete race child ${randomUUID()}`,
      }),
    ]);

    expect([deletion.status, creation.status].sort()).toEqual(['fulfilled', 'rejected']);
    if (deletion.status === 'fulfilled') {
      expect(creation).toMatchObject({
        reason: { code: 'INVALID_PARENT', statusCode: 400 },
      });
      expect(await prisma.costumeCategory.count({ where: { id: parent.id } })).toBe(0);
      descendantCategoryIds.splice(descendantCategoryIds.indexOf(parent.id), 1);
      return;
    }

    expect(deletion).toMatchObject({
      reason: { code: 'CATEGORY_IN_USE', statusCode: 409 },
    });
    expect(creation.status).toBe('fulfilled');
    if (creation.status === 'fulfilled') descendantCategoryIds.push(creation.value.id);
  });

  it('deletes only unused catalog records and preserves rental history guards', async () => {
    const marker = randomUUID();
    const emptyCategory = await prisma.costumeCategory.create({
      data: { name: `Delete empty ${marker}` },
    });
    await deleteCategory(actor, emptyCategory.id);
    expect(await prisma.costumeCategory.count({ where: { id: emptyCategory.id } })).toBe(0);

    const child = await prisma.costumeCategory.create({
      data: { name: `Delete child ${marker}`, parentId: categoryId },
    });
    descendantCategoryIds.push(child.id);
    await expect(deleteCategory(actor, categoryId)).rejects.toMatchObject({
      code: 'CATEGORY_IN_USE',
      statusCode: 409,
    });

    const model = await prisma.costumeModel.create({
      data: {
        categoryId: child.id,
        modelCode: `DELETE-${marker}`,
        name: `Delete model ${marker}`,
      },
    });
    modelIds.push(model.id);
    const variant = await prisma.costumeVariant.create({
      data: {
        modelId: model.id,
        variantCode: `DELETE-V-${marker}`,
        sizeCode: 'M',
        colorCode: 'BLACK',
        dailyRentalPriceVnd: 100n,
        depositAmountVnd: 100n,
        replacementValueVnd: 200n,
      },
    });
    const accessory = await prisma.costumeModelAccessory.create({
      data: { modelId: model.id, name: `Delete accessory ${marker}` },
    });
    let userId: string | undefined;
    let branchId: string | undefined;
    let orderId: string | undefined;
    let orderDeleted = false;
    let accessoryDeleted = false;
    let variantDeleted = false;
    try {
      const user = await prisma.user.create({
        data: {
          email: `delete-${marker}@example.test`,
          displayName: 'Delete test customer',
          status: 'ACTIVE',
          customer: { create: { customerCode: `DELETE-C-${marker}` } },
        },
      });
      userId = user.id;
      const branch = await prisma.branch.create({
        data: {
          branchCode: `DELETE-B-${marker}`,
          name: 'Delete test branch',
          address: 'Integration test only',
        },
      });
      branchId = branch.id;
      let policy = await prisma.rentalPolicyVersion.findFirst({
        orderBy: { effectiveFrom: 'desc' },
      });
      if (!policy) {
        policy = await prisma.rentalPolicyVersion.create({
          data: {
            versionCode: `TEST-POLICY-${marker}`,
            effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
            billingDayMode: 'CALENDAR_DAY',
            quoteValidHours: 24,
            changeReason: 'Chính sách tối thiểu dùng riêng cho kiểm thử PostgreSQL.',
          },
        });
      }
      const order = await prisma.rentalOrder.create({
        data: {
          orderCode: `DELETE-O-${marker}`,
          customerUserId: user.id,
          pickupBranchId: branch.id,
          channel: 'TEST',
          plannedStartAt: new Date('2026-12-01T00:00:00.000Z'),
          plannedDueAt: new Date('2026-12-02T00:00:00.000Z'),
          policyVersionId: policy.id,
          createdBy: user.id,
          items: {
            create: {
              variantId: variant.id,
              occupiedFrom: new Date('2026-12-01T00:00:00.000Z'),
              occupiedUntil: new Date('2026-12-02T00:00:00.000Z'),
              billableDays: 1,
              unitDailyPriceVnd: 100n,
              unitDepositVnd: 100n,
              accessories: {
                create: {
                  modelAccessoryId: accessory.id,
                  accessoryName: accessory.name,
                  quantityOut: 1,
                  unitReplacementValueVnd: 50n,
                },
              },
            },
          },
        },
      });
      orderId = order.id;

      await expect(deleteAccessory(actor, accessory.id)).rejects.toMatchObject({
        code: 'ACCESSORY_IN_USE',
        statusCode: 409,
      });
      await expect(deleteVariant(actor, variant.id)).rejects.toMatchObject({
        code: 'VARIANT_IN_USE',
        statusCode: 409,
      });
      await expect(deleteModel(actor, model.id)).rejects.toMatchObject({
        code: 'MODEL_IN_USE',
        statusCode: 409,
      });

      await prisma.rentalOrder.delete({ where: { id: order.id } });
      orderDeleted = true;
      await deleteAccessory(actor, accessory.id);
      accessoryDeleted = true;
      await deleteVariant(actor, variant.id);
      variantDeleted = true;
    } finally {
      if (!orderDeleted && orderId) await prisma.rentalOrder.deleteMany({ where: { id: orderId } });
      if (!accessoryDeleted)
        await prisma.costumeModelAccessory.deleteMany({ where: { id: accessory.id } });
      if (!variantDeleted) await prisma.costumeVariant.deleteMany({ where: { id: variant.id } });
      if (userId) {
        await prisma.customer.deleteMany({ where: { userId } });
        await prisma.user.deleteMany({ where: { id: userId } });
      }
      if (branchId) await prisma.branch.deleteMany({ where: { id: branchId } });
    }

    await deleteModel(actor, model.id);
    modelIds.splice(modelIds.indexOf(model.id), 1);
    await deleteCategory(actor, child.id);
    descendantCategoryIds.splice(descendantCategoryIds.indexOf(child.id), 1);
  }, 15_000);
});
