import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../database/prisma.js';
import { outboxEventTypes } from '../outbox/outbox.events.js';
import {
  PermanentOutboxError,
  processPendingOutboxEvents,
  startOutboxWorker,
  type OutboxEventHandler,
} from '../outbox/outbox.worker.js';
import {
  deleteStoredObject,
  isObjectStorageConfigured,
  listStoredObjectsPage,
} from '../../common/storage/s3.js';

export const mediaDeleteEventType = outboxEventTypes.mediaObjectDeleteRequested;

function objectKeyFromPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const objectKey = (payload as Record<string, unknown>).objectKey;
  return typeof objectKey === 'string' && objectKey.length > 0 ? objectKey : undefined;
}

const mediaDeleteHandler: OutboxEventHandler = {
  eventType: mediaDeleteEventType,
  maxRetries: env.MEDIA_DELETE_MAX_RETRIES,
  async handle(event) {
    const objectKey = objectKeyFromPayload(event.payloadJson);
    if (!objectKey) {
      throw new PermanentOutboxError('Outbox payload does not contain a valid objectKey');
    }
    await deleteStoredObject(objectKey);
  },
};

export async function processPendingMediaDeleteEvents(limit = 25) {
  return processPendingOutboxEvents([mediaDeleteHandler], { limit });
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

  let orphanCleanupRunning = false;
  const outboxWorker = startOutboxWorker([mediaDeleteHandler], {
    intervalMilliseconds: env.MEDIA_DELETE_WORKER_INTERVAL_SECONDS * 1_000,
  });

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

  void runOrphanCleanup();
  const orphanTimer = setInterval(
    () => void runOrphanCleanup(),
    env.MEDIA_ORPHAN_CLEANUP_INTERVAL_SECONDS * 1_000,
  );
  orphanTimer.unref();

  return {
    stop() {
      outboxWorker.stop();
      clearInterval(orphanTimer);
    },
  };
}
