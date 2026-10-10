import { describe, expect, it, vi } from 'vitest';

import { enqueueOutboxEvent } from '../src/modules/outbox/outbox.service.js';

describe('enqueueOutboxEvent', () => {
  const baseEvent = {
    eventType: 'ORDER_CONFIRMED',
    aggregateType: 'RentalOrder',
    aggregateId: '10000000-0000-4000-8000-000000000001',
    payloadJson: { orderCode: 'ORD-TEST' },
  };

  it('creates an event when no deduplication key is supplied', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'event-id' });
    const tx = { outboxEvent: { create, upsert: vi.fn() } };

    await expect(enqueueOutboxEvent(tx as never, baseEvent)).resolves.toEqual({ id: 'event-id' });
    expect(create).toHaveBeenCalledWith({
      data: {
        ...baseEvent,
        availableAt: undefined,
        deduplicationKey: undefined,
      },
    });
  });

  it('uses the unique deduplication key to make retries idempotent', async () => {
    const upsert = vi.fn().mockResolvedValue({ id: 'existing-event' });
    const tx = { outboxEvent: { create: vi.fn(), upsert } };

    await expect(
      enqueueOutboxEvent(tx as never, {
        ...baseEvent,
        deduplicationKey: 'order-confirmed:10000000-0000-4000-8000-000000000001',
      }),
    ).resolves.toEqual({ id: 'existing-event' });

    expect(upsert).toHaveBeenCalledWith({
      where: { deduplicationKey: 'order-confirmed:10000000-0000-4000-8000-000000000001' },
      create: {
        ...baseEvent,
        availableAt: undefined,
        deduplicationKey: 'order-confirmed:10000000-0000-4000-8000-000000000001',
      },
      update: {},
    });
  });
});
