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
  },
}));

vi.mock('../src/database/prisma.js', () => ({ prisma: { outboxEvent: mocks.outbox } }));

const { PermanentOutboxError, processPendingOutboxEvents } =
  await import('../src/modules/outbox/outbox.worker.js');

const event = {
  id: '10000000-0000-4000-8000-000000000001',
  eventType: 'ORDER_CONFIRMED',
  aggregateType: 'RentalOrder',
  aggregateId: '20000000-0000-4000-8000-000000000001',
  payloadJson: { orderCode: 'ORD-TEST' },
  status: 'PENDING',
  availableAt: new Date('2026-10-10T00:00:00.000Z'),
  processedAt: null,
  retryCount: 0,
  lastError: null,
  createdAt: new Date('2026-10-10T00:00:00.000Z'),
  deduplicationKey: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.outbox.updateMany.mockResolvedValue({ count: 0 });
});

describe('outbox worker', () => {
  it('claims and marks a handled event as processed', async () => {
    const handle = vi.fn().mockResolvedValue(undefined);
    mocks.outbox.findMany.mockResolvedValue([event]);
    mocks.outbox.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });

    await expect(
      processPendingOutboxEvents([{ eventType: 'ORDER_CONFIRMED', maxRetries: 3, handle }]),
    ).resolves.toEqual({ found: 1, processed: 1 });

    expect(handle).toHaveBeenCalledWith(event);
    expect(mocks.outbox.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSED' }) }),
    );
  });

  it('returns transient failures to the queue with an increased retry count', async () => {
    mocks.outbox.findMany.mockResolvedValue([event]);
    mocks.outbox.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });

    await processPendingOutboxEvents([
      {
        eventType: 'ORDER_CONFIRMED',
        maxRetries: 3,
        handle: vi.fn().mockRejectedValue(new Error('smtp unavailable')),
      },
    ]);

    expect(mocks.outbox.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING', retryCount: 1 }),
      }),
    );
  });

  it('marks malformed payloads as failed without retrying', async () => {
    mocks.outbox.findMany.mockResolvedValue([event]);
    mocks.outbox.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });

    await processPendingOutboxEvents([
      {
        eventType: 'ORDER_CONFIRMED',
        maxRetries: 3,
        handle: vi.fn().mockRejectedValue(new PermanentOutboxError('malformed payload')),
      },
    ]);

    expect(mocks.outbox.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED', retryCount: 1 }),
      }),
    );
  });
});
