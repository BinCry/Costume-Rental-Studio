import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../database/prisma.js';
import {
  deleteStoredObject,
  isObjectStorageConfigured,
  listStoredObjectsPage,
} from '../../common/storage/s3.js';

export const mediaDeleteEventType = 'MEDIA_OBJECT_DELETE_REQUESTED';

const deleteLeaseMilliseconds = 60_000;
const retryBaseMilliseconds = 5_000;
const retryMaximumMilliseconds = 60 * 60 * 1_000;

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 2_000);
}

function objectKeyFromPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const objectKey = (payload as Record<string, unknown>).objectKey;
  return typeof objectKey === 'string' && objectKey.length > 0 ? objectKey : undefined;
}

function nextRetryAt(retryCount: number, now = Date.now()) {
  const delay = Math.min(
    retryBaseMilliseconds * 2 ** Math.min(retryCount, 10),
    retryMaximumMilliseconds,
  );
  return new Date(now + delay);
}

export async function processPendingMediaDeleteEvents(limit = 25) {
  const now = new Date();
  await prisma.outboxEvent.updateMany({
    where: {
      eventType: mediaDeleteEventType,
      status: 'PROCESSING',
      availableAt: { lte: now },
    },
    data: { status: 'PENDING' },
  });

  const events = await prisma.outboxEvent.findMany({
    where: {
      eventType: mediaDeleteEventType,
      status: 'PENDING',
      availableAt: { lte: now },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  let processed = 0;
  for (const event of events) {
    const claimed = await prisma.outboxEvent.updateMany({
      where: { id: event.id, status: 'PENDING' },
      data: {
        status: 'PROCESSING',
        availableAt: new Date(Date.now() + deleteLeaseMilliseconds),
      },
    });
    if (claimed.count !== 1) continue;

    const objectKey = objectKeyFromPayload(event.payloadJson);
    if (!objectKey) {
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'FAILED',
          lastError: 'Outbox payload does not contain a valid objectKey',
        },
      });
      continue;
    }

    try {
      await deleteStoredObject(objectKey);
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'PROCESSED',
          processedAt: new Date(),
          lastError: null,
        },
      });
      processed += 1;
    } catch (error: unknown) {
      const retryCount = event.retryCount + 1;
      const exhausted = retryCount >= env.MEDIA_DELETE_MAX_RETRIES;
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: exhausted ? 'FAILED' : 'PENDING',
          retryCount,
          availableAt: nextRetryAt(retryCount),
          lastError: errorMessage(error),
        },
      });
      logger.warn(
        { err: error, eventId: event.id, objectKey, retryCount, exhausted },
        'Could not delete media object from outbox',
      );
    }
  }

  return { found: events.length, processed };
}

export async function cleanupOrphanedCatalogMedia(now = new Date()) {
  const cutoff = new Date(now.getTime() - env.MEDIA_ORPHAN_RETENTION_HOURS * 60 * 60 * 1_000);
  let scanned = 0;
  let deleted = 0;

  for (const prefix of ['catalog/', 'catalog-staging/', 'rentals/', 'rental-staging/']) {
    let continuationToken: string | undefined;
    do {
      const page = await listStoredObjectsPage({ prefix, continuationToken, maxKeys: 500 });
      continuationToken = page.nextContinuationToken;
      const candidates = page.objects.filter(
        (object) => object.lastModified && object.lastModified <= cutoff,
      );
      scanned += page.objects.length;
      if (candidates.length === 0) continue;

      const keys = candidates.map((object) => object.key);
      const registered =
        prefix === 'catalog/'
          ? await prisma.costumeMedia.findMany({
              where: { objectKey: { in: keys } },
              select: { objectKey: true },
            })
          : prefix === 'rentals/'
            ? await prisma.rentalItemEvidence.findMany({
                where: { objectKey: { in: keys } },
                select: { objectKey: true },
              })
            : [];
      const registeredKeys = new Set(registered.map((item) => item.objectKey));

      for (const key of keys) {
        if (registeredKeys.has(key)) continue;
        try {
          await deleteStoredObject(key);
          deleted += 1;
        } catch (error: unknown) {
          logger.warn({ err: error, objectKey: key }, 'Could not delete orphaned media object');
        }
      }
    } while (continuationToken);
  }

  return { scanned, deleted };
}

export async function cleanupProcessedMediaDeleteEvents(now = new Date()) {
  const cutoff = new Date(now.getTime() - env.MEDIA_OUTBOX_RETENTION_DAYS * 24 * 60 * 60 * 1_000);
  const result = await prisma.outboxEvent.deleteMany({
    where: {
      eventType: mediaDeleteEventType,
      status: 'PROCESSED',
      processedAt: { lte: cutoff },
    },
  });
  return { deleted: result.count };
}

export function startMediaMaintenance() {
  if (!isObjectStorageConfigured()) {
    logger.info('Media maintenance disabled because object storage is not configured');
    return { stop: () => undefined };
  }

  let deleteWorkerRunning = false;
  let orphanCleanupRunning = false;

  const runDeleteWorker = async () => {
    if (deleteWorkerRunning) return;
    deleteWorkerRunning = true;
    try {
      await processPendingMediaDeleteEvents();
    } catch (error: unknown) {
      logger.error({ err: error }, 'Media delete worker failed');
    } finally {
      deleteWorkerRunning = false;
    }
  };

  const runOrphanCleanup = async () => {
    if (orphanCleanupRunning) return;
    orphanCleanupRunning = true;
    try {
      const [orphanedObjects, processedOutboxEvents] = await Promise.all([
        cleanupOrphanedCatalogMedia(),
        cleanupProcessedMediaDeleteEvents(),
      ]);
      logger.info(
        { orphanedObjects, processedOutboxEvents },
        'Media maintenance cleanup completed',
      );
    } catch (error: unknown) {
      logger.error({ err: error }, 'Media orphan cleanup failed');
    } finally {
      orphanCleanupRunning = false;
    }
  };

  void runDeleteWorker();
  void runOrphanCleanup();
  const deleteTimer = setInterval(
    () => void runDeleteWorker(),
    env.MEDIA_DELETE_WORKER_INTERVAL_SECONDS * 1_000,
  );
  const orphanTimer = setInterval(
    () => void runOrphanCleanup(),
    env.MEDIA_ORPHAN_CLEANUP_INTERVAL_SECONDS * 1_000,
  );
  deleteTimer.unref();
  orphanTimer.unref();

  return {
    stop() {
      clearInterval(deleteTimer);
      clearInterval(orphanTimer);
    },
  };
}
