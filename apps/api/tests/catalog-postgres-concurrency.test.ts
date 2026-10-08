import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { AuthenticatedActor } from '../src/modules/auth/authorization.js';

const databaseTestUrl = process.env.DATABASE_TEST_URL;
const runDatabaseTests = process.env.RUN_DATABASE_TESTS === '1' || Boolean(databaseTestUrl);

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
});
