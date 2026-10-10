import { logger } from '../../config/logger.js';
import { prisma } from '../../database/prisma.js';

/**
 * Automatically releases reservations that were prepared for pickup but were
 * not collected before the policy no-show grace period elapsed.
 *
 * The operation is deliberately idempotent: each order is locked and its
 * status is checked again inside the transaction before being changed.
 */
export async function processAutomaticNoShows(now = new Date(), limit = 50) {
  const candidates = await prisma.rentalOrder.findMany({
    where: { status: 'READY_FOR_PICKUP', plannedStartAt: { lte: now } },
    select: { id: true },
    orderBy: { plannedStartAt: 'asc' },
    take: limit,
  });
  let processed = 0;

  for (const candidate of candidates) {
    const changed = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM rental_orders WHERE id = ${candidate.id}::uuid FOR UPDATE
      `;
      if (rows.length === 0) return false;
      const order = await tx.rentalOrder.findUnique({
        where: { id: candidate.id },
        select: {
          id: true,
          status: true,
          orderCode: true,
          plannedStartAt: true,
          policyVersion: { select: { noShowGraceMinutes: true } },
        },
      });
      if (!order) return false;
      if (
        order.status !== 'READY_FOR_PICKUP' ||
        now.getTime() < order.plannedStartAt.getTime() + order.policyVersion.noShowGraceMinutes * 60_000
      )
        return false;

      await tx.rentalOrderItem.updateMany({
        where: { orderId: order.id },
        data: { allocationStatus: 'RELEASED' },
      });
      await tx.rentalOrder.update({
        where: { id: order.id },
        data: { status: 'NO_SHOW', version: { increment: 1 } },
      });
      await tx.rentalOrderEvent.create({
        data: {
          orderId: order.id,
          eventType: 'AUTO_NO_SHOW',
          fromStatus: 'READY_FOR_PICKUP',
          toStatus: 'NO_SHOW',
          actorUserId: null,
          metadataJson: { reason: 'NO_SHOW_GRACE_ELAPSED', orderCode: order.orderCode },
        },
      });
      return true;
    });
    if (changed) processed += 1;
  }

  return { scanned: candidates.length, processed };
}

export function startRentalMaintenance(intervalMilliseconds = 60_000) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await processAutomaticNoShows();
      if (result.processed > 0) logger.info(result, 'Automatic no-show processing completed');
    } catch (error: unknown) {
      logger.error({ err: error }, 'Automatic no-show processing failed');
    } finally {
      running = false;
    }
  };

  void run();
  const timer = setInterval(() => void run(), intervalMilliseconds);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}
