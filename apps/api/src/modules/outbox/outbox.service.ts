import type { Prisma } from '../../generated/prisma/client.js';

export interface EnqueueOutboxEventInput {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payloadJson: Prisma.InputJsonValue;
  availableAt?: Date;
  /**
   * A stable key for an externally visible side effect.  Reusing it returns
   * the original event instead of scheduling the same side effect twice.
   */
  deduplicationKey?: string;
}

export async function enqueueOutboxEvent(
  tx: Prisma.TransactionClient,
  input: EnqueueOutboxEventInput,
) {
  const data = {
    eventType: input.eventType,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    payloadJson: input.payloadJson,
    availableAt: input.availableAt,
    deduplicationKey: input.deduplicationKey,
  };

  if (!input.deduplicationKey) return tx.outboxEvent.create({ data });

  return tx.outboxEvent.upsert({
    where: { deduplicationKey: input.deduplicationKey },
    create: data,
    update: {},
  });
}
