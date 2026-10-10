import { logger } from '../../config/logger.js';
import { prisma } from '../../database/prisma.js';
import type { OutboxEvent } from '../../generated/prisma/client.js';

const defaultLeaseMilliseconds = 60_000;
const retryBaseMilliseconds = 5_000;
const retryMaximumMilliseconds = 60 * 60 * 1_000;

export class PermanentOutboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentOutboxError';
  }
}

export interface OutboxEventHandler {
  eventType: string;
  maxRetries: number;
  handle(event: OutboxEvent): Promise<void>;
}

interface ProcessOptions {
  limit?: number;
  leaseMilliseconds?: number;
  now?: Date;
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 2_000);
}

function nextRetryAt(retryCount: number, now = Date.now()) {
  const delay = Math.min(
    retryBaseMilliseconds * 2 ** Math.min(retryCount, 10),
    retryMaximumMilliseconds,
  );
  return new Date(now + delay);
}

export async function processPendingOutboxEvents(
  handlers: readonly OutboxEventHandler[],
  options: ProcessOptions = {},
) {
  if (handlers.length === 0) return { found: 0, processed: 0 };

  const handlerByEventType = new Map(handlers.map((handler) => [handler.eventType, handler]));
  const eventTypes = [...handlerByEventType.keys()];
  const now = options.now ?? new Date();
  const leaseMilliseconds = options.leaseMilliseconds ?? defaultLeaseMilliseconds;

  await prisma.outboxEvent.updateMany({
    where: {
      eventType: { in: eventTypes },
      status: 'PROCESSING',
      availableAt: { lte: now },
    },
    data: { status: 'PENDING' },
  });

  const events = await prisma.outboxEvent.findMany({
    where: {
      eventType: { in: eventTypes },
      status: 'PENDING',
      availableAt: { lte: now },
    },
    orderBy: { createdAt: 'asc' },
    take: options.limit ?? 25,
  });

  let processed = 0;
  for (const event of events) {
    const handler = handlerByEventType.get(event.eventType);
    if (!handler) continue;

    const claimed = await prisma.outboxEvent.updateMany({
      where: { id: event.id, status: 'PENDING', availableAt: { lte: now } },
      data: {
        status: 'PROCESSING',
        availableAt: new Date(Date.now() + leaseMilliseconds),
      },
    });
    if (claimed.count !== 1) continue;

    try {
      await handler.handle(event);
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
      const exhausted = error instanceof PermanentOutboxError || retryCount >= handler.maxRetries;
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
        { err: error, eventId: event.id, eventType: event.eventType, retryCount, exhausted },
        'Outbox event handler failed',
      );
    }
  }

  return { found: events.length, processed };
}

export function startOutboxWorker(
  handlers: readonly OutboxEventHandler[],
  options: { intervalMilliseconds: number; leaseMilliseconds?: number; limit?: number },
) {
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      await processPendingOutboxEvents(handlers, {
        limit: options.limit,
        leaseMilliseconds: options.leaseMilliseconds,
      });
    } catch (error: unknown) {
      logger.error({ err: error }, 'Outbox worker failed');
    } finally {
      running = false;
    }
  };

  void run();
  const timer = setInterval(() => void run(), options.intervalMilliseconds);
  timer.unref();

  return { stop: () => clearInterval(timer) };
}
