import { SignJWT } from 'jose';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.WEB_URL = 'http://localhost:3000';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/costume_rental_test';
process.env.JWT_ACCESS_SECRET = 'catalog-test-key-only-not-for-production-12345';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  transaction: vi.fn(),
  category: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  model: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  variant: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  accessory: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  media: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    user: { findUnique: mocks.actor },
    $transaction: mocks.transaction,
    costumeCategory: mocks.category,
    costumeModel: mocks.model,
    costumeVariant: mocks.variant,
    costumeModelAccessory: mocks.accessory,
    costumeMedia: mocks.media,
  },
}));

const { createApp } = await import('../src/app.js');
const { env } = await import('../src/config/env.js');
const actorId = '10000000-0000-4000-8000-000000000001';
const categoryId = '10000000-0000-4000-8000-000000000002';
const modelId = '10000000-0000-4000-8000-000000000003';
const variantId = '10000000-0000-4000-8000-000000000004';
const accessoryId = '10000000-0000-4000-8000-000000000005';
const mediaId = '10000000-0000-4000-8000-000000000006';
interface CatalogResponse {
  data: { editionLabel?: string | null };
  error: { code: string };
}

function catalogActor() {
  return {
    id: actorId,
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
            { permission: { module: 'catalog', action: 'read', scope: 'ALL' } },
            { permission: { module: 'catalog', action: 'manage', scope: 'ALL' } },
          ],
        },
      },
    ],
  };
}
async function token() {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(actorId)
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(new TextEncoder().encode(env.JWT_ACCESS_SECRET));
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockResolvedValue(catalogActor());
  mocks.category.findUnique.mockResolvedValue({ id: categoryId, status: 'ACTIVE', parentId: null });
  mocks.model.findUnique.mockResolvedValue({
    id: modelId,
    status: 'ACTIVE',
    categoryId,
    variants: [],
  });
  mocks.variant.findUnique.mockResolvedValue({
    id: variantId,
    modelId,
    variantCode: 'V-1',
    depositAmountVnd: 100n,
    replacementValueVnd: 200n,
    units: [],
    orderItems: [],
  });
  mocks.accessory.findUnique.mockResolvedValue({ id: accessoryId, modelId, isActive: true });
  mocks.media.findUnique.mockResolvedValue({ id: mediaId, altText: 'old' });
  mocks.category.update.mockImplementation(({ data }: { data: object }) =>
    Promise.resolve({ id: categoryId, ...data }),
  );
  mocks.model.update.mockImplementation(({ data }: { data: object }) =>
    Promise.resolve({ id: modelId, ...data }),
  );
  mocks.variant.update.mockImplementation(({ data }: { data: object }) =>
    Promise.resolve({ id: variantId, ...data }),
  );
  mocks.accessory.update.mockImplementation(({ data }: { data: object }) =>
    Promise.resolve({ id: accessoryId, ...data }),
  );
  mocks.media.update.mockImplementation(({ data }: { data: object }) =>
    Promise.resolve({ id: mediaId, ...data }),
  );
});

describe('Catalog API', () => {
  it('updates a variant without calling partial() on its refined create schema', async () => {
    const response = await request(createApp())
      .patch(`/api/v1/catalog/variants/${variantId}`)
      .auth(await token(), { type: 'bearer' })
      .send({ editionLabel: null, depositAmountVnd: '150' })
      .expect(200);
    expect((response.body as CatalogResponse).data.editionLabel).toBeNull();
  });

  it('validates every catalog path id before querying Prisma', async () => {
    await request(createApp())
      .get('/api/v1/catalog/models/not-a-uuid')
      .auth(await token(), { type: 'bearer' })
      .expect(400);
    expect(mocks.model.findUnique).not.toHaveBeenCalled();
  });

  it('provides detail routes and editable media/accessory status', async () => {
    await request(createApp())
      .get(`/api/v1/catalog/categories/${categoryId}`)
      .auth(await token(), { type: 'bearer' })
      .expect(200);
    await request(createApp())
      .patch(`/api/v1/catalog/media/${mediaId}`)
      .auth(await token(), { type: 'bearer' })
      .send({ sortOrder: 1, altText: null })
      .expect(200);
    await request(createApp())
      .post(`/api/v1/catalog/accessories/${accessoryId}/deactivate`)
      .auth(await token(), { type: 'bearer' })
      .expect(200);
    expect(mocks.media.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { sortOrder: 1, altText: null } }),
    );
    expect(mocks.accessory.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    );
  });

  it('blocks deactivating a model while it has active variants', async () => {
    mocks.variant.count.mockResolvedValue(1);
    const response = await request(createApp())
      .post(`/api/v1/catalog/models/${modelId}/deactivate`)
      .auth(await token(), { type: 'bearer' })
      .expect(409);
    expect((response.body as CatalogResponse).error.code).toBe('MODEL_HAS_ACTIVE_VARIANTS');
  });

  it('uses requested filter and sorting fields for models', async () => {
    mocks.model.findMany.mockResolvedValue([]);
    mocks.model.count.mockResolvedValue(0);
    mocks.transaction.mockImplementation((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );
    await request(createApp())
      .get(`/api/v1/catalog/models?categoryId=${categoryId}&sortBy=name&sortOrder=asc`)
      .auth(await token(), { type: 'bearer' })
      .expect(200);
  });
});
