import { SignJWT } from 'jose';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.WEB_URL = 'http://localhost:3000';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/costume_rental_test';
process.env.JWT_ACCESS_SECRET = 'upload-test-key-only-not-for-production-12345';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  transaction: vi.fn(),
  model: { findUnique: vi.fn() },
  variant: { findUnique: vi.fn() },
  media: { findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), delete: vi.fn() },
  outbox: { create: vi.fn(), update: vi.fn() },
  presign: vi.fn(),
  promoteStoredImage: vi.fn(),
  deleteStoredObject: vi.fn(),
}));

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    user: { findUnique: mocks.actor },
    $transaction: mocks.transaction,
    costumeModel: mocks.model,
    costumeVariant: mocks.variant,
    costumeMedia: mocks.media,
    outboxEvent: mocks.outbox,
  },
}));
vi.mock('../src/common/storage/s3.js', () => ({
  allowedImageContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
  createPresignedPostUrl: mocks.presign,
  promoteStoredImage: mocks.promoteStoredImage,
  deleteStoredObject: mocks.deleteStoredObject,
  isObjectStorageConfigured: () => true,
  listStoredObjectsPage: vi.fn(),
  imageContentTypeForKey: (key: string) => (key.endsWith('.jpg') ? 'image/jpeg' : undefined),
  publicObjectUrl: () => undefined,
}));

const { createApp } = await import('../src/app.js');
const { env } = await import('../src/config/env.js');
const actorId = '10000000-0000-4000-8000-000000000001';
const modelId = '10000000-0000-4000-8000-000000000003';

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
          rolePermissions: [{ permission: { module: 'catalog', action: 'manage', scope: 'ALL' } }],
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
  mocks.model.findUnique.mockResolvedValue({ id: modelId });
  mocks.presign.mockResolvedValue({
    uploadUrl: 'https://s3.example.test/costume-media/signed-upload',
    expiresAt: '2026-10-07T00:05:00.000Z',
    fields: { key: 'catalog-staging/models/signed-upload.jpg' },
  });
  mocks.promoteStoredImage.mockResolvedValue(undefined);
  mocks.media.count.mockResolvedValue(0);
  mocks.deleteStoredObject.mockResolvedValue(undefined);
  mocks.transaction.mockImplementation((callback: (transaction: object) => Promise<unknown>) =>
    callback({ costumeMedia: mocks.media, outboxEvent: mocks.outbox }),
  );
});

describe('Upload API', () => {
  it('creates a short-lived direct POST policy for a catalog model image', async () => {
    const response = await request(createApp())
      .post('/api/v1/uploads/presign')
      .auth(await token(), { type: 'bearer' })
      .send({
        purpose: 'catalog-media',
        ownerType: 'model',
        ownerId: modelId,
        contentType: 'image/jpeg',
        size: 1_024,
      })
      .expect(200);

    expect(response.body.data).toMatchObject({
      method: 'POST',
      uploadUrl: 'https://s3.example.test/costume-media/signed-upload',
      fields: { key: 'catalog-staging/models/signed-upload.jpg' },
    });
    expect(response.body.data.objectKey).toMatch(
      new RegExp(`^catalog-staging/models/${modelId}/[0-9a-f-]+\\.jpg$`),
    );
    expect(mocks.presign).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'image/jpeg' }),
    );
  });

  it('rejects oversized uploads before requesting a SeaweedFS URL', async () => {
    await request(createApp())
      .post('/api/v1/uploads/presign')
      .auth(await token(), { type: 'bearer' })
      .send({
        purpose: 'catalog-media',
        ownerType: 'model',
        ownerId: modelId,
        contentType: 'image/jpeg',
        size: 10 * 1024 * 1024 + 1,
      })
      .expect(400);

    expect(mocks.presign).not.toHaveBeenCalled();
  });

  it('requires the uploaded object to belong to the catalog owner before creating media', async () => {
    const uploadKey = `catalog-staging/models/${modelId}/10000000-0000-4000-8000-000000000007.jpg`;
    mocks.media.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'media-id', ...data, altText: null }),
    );

    await request(createApp())
      .post(`/api/v1/catalog/models/${modelId}/media`)
      .auth(await token(), { type: 'bearer' })
      .send({ uploadKey, sortOrder: 0 })
      .expect(201);

    expect(mocks.promoteStoredImage).toHaveBeenCalledWith({
      uploadKey,
      objectKey: expect.stringMatching(new RegExp(`^catalog/models/${modelId}/[0-9a-f-]+\\.jpg$`)),
      contentType: 'image/jpeg',
      maxBytes: 10 * 1024 * 1024,
    });
    expect(mocks.media.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          modelId,
          objectKey: expect.stringMatching(
            new RegExp(`^catalog/models/${modelId}/[0-9a-f-]+\\.jpg$`),
          ),
        }),
      }),
    );
    expect(mocks.deleteStoredObject).toHaveBeenCalledWith(uploadKey);
  });

  it('rejects a media key that was issued for a different catalog owner', async () => {
    const otherModelId = '10000000-0000-4000-8000-000000000008';
    await request(createApp())
      .post(`/api/v1/catalog/models/${modelId}/media`)
      .auth(await token(), { type: 'bearer' })
      .send({
        uploadKey: `catalog-staging/models/${otherModelId}/10000000-0000-4000-8000-000000000007.jpg`,
      })
      .expect(400);

    expect(mocks.promoteStoredImage).not.toHaveBeenCalled();
    expect(mocks.media.create).not.toHaveBeenCalled();
  });

  it('rejects creating more than the configured model image limit', async () => {
    const uploadKey = `catalog-staging/models/${modelId}/10000000-0000-4000-8000-000000000007.jpg`;
    mocks.media.count.mockResolvedValue(10);

    const response = await request(createApp())
      .post(`/api/v1/catalog/models/${modelId}/media`)
      .auth(await token(), { type: 'bearer' })
      .send({ uploadKey })
      .expect(409);

    expect(response.body.error.code).toBe('MEDIA_LIMIT_REACHED');
    expect(mocks.promoteStoredImage).not.toHaveBeenCalled();
    expect(mocks.media.create).not.toHaveBeenCalled();
  });

  it('rejects registering the same storage object twice', async () => {
    const uploadKey = `catalog-staging/models/${modelId}/10000000-0000-4000-8000-000000000007.jpg`;
    mocks.media.create.mockRejectedValue({ code: 'P2002' });

    const response = await request(createApp())
      .post(`/api/v1/catalog/models/${modelId}/media`)
      .auth(await token(), { type: 'bearer' })
      .send({ uploadKey })
      .expect(409);

    expect(response.body.error.code).toBe('MEDIA_ALREADY_REGISTERED');
  });

  it('deletes media and records the storage deletion in the outbox atomically', async () => {
    const mediaId = '10000000-0000-4000-8000-000000000006';
    const eventId = '10000000-0000-4000-8000-000000000009';
    const objectKey = `catalog/models/${modelId}/10000000-0000-4000-8000-000000000007.jpg`;
    mocks.media.findUnique.mockResolvedValue({ id: mediaId, modelId, objectKey });
    mocks.outbox.create.mockResolvedValue({ id: eventId });

    await request(createApp())
      .delete(`/api/v1/catalog/media/${mediaId}`)
      .auth(await token(), { type: 'bearer' })
      .expect(204);

    expect(mocks.media.delete).toHaveBeenCalledWith({ where: { id: mediaId } });
    expect(mocks.outbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'MEDIA_OBJECT_DELETE_REQUESTED',
          aggregateId: mediaId,
          payloadJson: { objectKey },
        }),
      }),
    );
    expect(mocks.deleteStoredObject).toHaveBeenCalledWith(objectKey);
    expect(mocks.outbox.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: eventId },
        data: expect.objectContaining({ status: 'PROCESSED' }),
      }),
    );
  });
});
