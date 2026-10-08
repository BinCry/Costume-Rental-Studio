import { beforeEach, describe, expect, it, vi } from 'vitest';

/* eslint-disable @typescript-eslint/no-unsafe-assignment */

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.WEB_URL = 'http://localhost:3000';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/costume_rental_test';

const mocks = vi.hoisted(() => ({
  outbox: {
    updateMany: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  media: { findMany: vi.fn() },
  deleteStoredObject: vi.fn(),
  listStoredObjectsPage: vi.fn(),
}));

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    outboxEvent: mocks.outbox,
    costumeMedia: mocks.media,
  },
}));

vi.mock('../src/common/storage/s3.js', () => ({
  deleteStoredObject: mocks.deleteStoredObject,
  isObjectStorageConfigured: () => true,
  listStoredObjectsPage: mocks.listStoredObjectsPage,
}));

const {
  cleanupOrphanedCatalogMedia,
  cleanupProcessedMediaDeleteEvents,
  processPendingMediaDeleteEvents,
} = await import('../src/modules/uploads/media-maintenance.service.js');

beforeEach(() => {
  vi.resetAllMocks();
  mocks.outbox.updateMany.mockResolvedValue({ count: 0 });
});

describe('media maintenance', () => {
  it('claims and processes pending object deletion events', async () => {
    const event = {
      id: '10000000-0000-4000-8000-000000000001',
      payloadJson: { objectKey: 'catalog/models/model/image.jpg' },
      retryCount: 0,
    };
    mocks.outbox.findMany.mockResolvedValue([event]);
    mocks.outbox.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    mocks.deleteStoredObject.mockResolvedValue(undefined);

    await expect(processPendingMediaDeleteEvents()).resolves.toEqual({ found: 1, processed: 1 });

    expect(mocks.deleteStoredObject).toHaveBeenCalledWith('catalog/models/model/image.jpg');
    expect(mocks.outbox.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSED' }) }),
    );
  });

  it('returns failed storage deletion events to the retry queue', async () => {
    const event = {
      id: '10000000-0000-4000-8000-000000000001',
      payloadJson: { objectKey: 'catalog/models/model/image.jpg' },
      retryCount: 0,
    };
    mocks.outbox.findMany.mockResolvedValue([event]);
    mocks.outbox.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    mocks.deleteStoredObject.mockRejectedValue(new Error('storage unavailable'));

    await processPendingMediaDeleteEvents();

    expect(mocks.outbox.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING', retryCount: 1 }),
      }),
    );
  });

  it('deletes only old catalog objects that have no media record', async () => {
    const now = new Date('2026-10-08T12:00:00.000Z');
    const old = new Date('2026-10-06T12:00:00.000Z');
    const recent = new Date('2026-10-08T11:00:00.000Z');
    mocks.listStoredObjectsPage.mockImplementation(({ prefix }: { prefix: string }) =>
      Promise.resolve({
        objects:
          prefix === 'catalog/'
            ? [
                { key: 'catalog/models/a/registered.jpg', lastModified: old },
                { key: 'catalog/models/a/orphan.jpg', lastModified: old },
                { key: 'catalog/models/a/recent.jpg', lastModified: recent },
              ]
            : [
                { key: 'catalog-staging/models/a/expired.jpg', lastModified: old },
                { key: 'catalog-staging/models/a/recent.jpg', lastModified: recent },
              ],
        nextContinuationToken: undefined,
      }),
    );
    mocks.media.findMany.mockResolvedValue([{ objectKey: 'catalog/models/a/registered.jpg' }]);
    mocks.deleteStoredObject.mockResolvedValue(undefined);

    await expect(cleanupOrphanedCatalogMedia(now)).resolves.toEqual({ scanned: 5, deleted: 2 });
    expect(mocks.deleteStoredObject).toHaveBeenCalledTimes(2);
    expect(mocks.deleteStoredObject).toHaveBeenCalledWith('catalog/models/a/orphan.jpg');
    expect(mocks.deleteStoredObject).toHaveBeenCalledWith('catalog-staging/models/a/expired.jpg');
    expect(mocks.media.findMany).toHaveBeenCalledTimes(1);
  });

  it('removes only expired processed media-delete outbox events', async () => {
    mocks.outbox.deleteMany.mockResolvedValue({ count: 4 });

    await expect(
      cleanupProcessedMediaDeleteEvents(new Date('2026-10-08T12:00:00.000Z')),
    ).resolves.toEqual({ deleted: 4 });

    expect(mocks.outbox.deleteMany).toHaveBeenCalledWith({
      where: {
        eventType: 'MEDIA_OBJECT_DELETE_REQUESTED',
        status: 'PROCESSED',
        processedAt: { lte: new Date('2026-09-08T12:00:00.000Z') },
      },
    });
  });
});
