import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  listOpenRentalReadinessFindings,
  resolveRentalReadinessFinding,
  upsertRentalReadinessFinding,
  type AgentFindingUpsertInput,
} from '../agent/agent-internal.service.js';
import { assertPermission, type AuthenticatedActor } from '../auth/authorization.js';
import {
  buildPreviousRentalRisk,
  type PreviousRentalRiskParts,
} from './rental-readiness.service.js';

export const RENTAL_RETURN_OVERDUE_RULE = 'RENTAL_RETURN_OVERDUE' as const;
const RULE_VERSION = 'v1' as const;
const NEXT_ORDER_STATES = ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP'] as const;
const ESCALATION_MINUTES = 24 * 60;

const overdueOrderSelect = {
  id: true,
  status: true,
  pickupBranchId: true,
  plannedStartAt: true,
  plannedDueAt: true,
  version: true,
  policyVersion: {
    select: { lateGraceMinutes: true, defaultCleaningBufferMinutes: true },
  },
  items: {
    select: {
      id: true,
      variantId: true,
      unitId: true,
      allocationStatus: true,
      variant: { select: { cleaningBufferMinutes: true } },
    },
  },
} as const;

type OverdueOrder = Prisma.RentalOrderGetPayload<{ select: typeof overdueOrderSelect }>;

const defaultAgentClient = {
  listOpen: (cursor?: string, limit = 100) =>
    listOpenRentalReadinessFindings(cursor, limit, RENTAL_RETURN_OVERDUE_RULE),
  upsert: upsertRentalReadinessFinding,
  resolve: (dedupeKey: string, observedAt: Date, evidence: Record<string, unknown>) =>
    resolveRentalReadinessFinding(dedupeKey, observedAt, evidence, RENTAL_RETURN_OVERDUE_RULE),
};

type OverdueAgentClient = typeof defaultAgentClient;

function dedupeKey(orderId: string, plannedDueAt: Date) {
  return [RENTAL_RETURN_OVERDUE_RULE, RULE_VERSION, orderId, plannedDueAt.toISOString()].join(':');
}

function overdueSeverity(overdueMinutes: number): AgentFindingUpsertInput['severity'] {
  if (overdueMinutes > ESCALATION_MINUTES) return 'CRITICAL';
  if (overdueMinutes > 6 * 60) return 'HIGH';
  if (overdueMinutes > 2 * 60) return 'MEDIUM';
  return 'LOW';
}

export function buildOverdueReturnRisk(
  order: OverdueOrder,
  observedAt: Date,
  downstreamReadinessRisk = false,
) {
  if (order.status !== 'ACTIVE' || downstreamReadinessRisk) return null;
  const activeItems = order.items.filter(
    (item) => item.allocationStatus === 'ACTIVE' && item.unitId,
  );
  if (activeItems.length === 0) return null;
  const graceDeadline = new Date(
    order.plannedDueAt.getTime() + Math.max(0, order.policyVersion.lateGraceMinutes) * 60_000,
  );
  if (observedAt.getTime() <= graceDeadline.getTime()) return null;
  const overdueMinutes = Math.floor((observedAt.getTime() - graceDeadline.getTime()) / 60_000);
  return {
    ruleCode: RENTAL_RETURN_OVERDUE_RULE,
    ruleVersion: RULE_VERSION,
    dedupeKey: dedupeKey(order.id, order.plannedDueAt),
    branchId: order.pickupBranchId,
    primaryEntityId: order.id,
    affectedEntityId: null,
    unitId: null,
    windowStart: order.plannedStartAt.toISOString(),
    windowEnd: graceDeadline.toISOString(),
    severity: overdueSeverity(overdueMinutes),
    deadlineAt: graceDeadline.toISOString(),
    evidence: {
      primaryEntityType: 'RENTAL_ORDER',
      orderId: order.id,
      orderStatus: order.status,
      orderVersion: order.version,
      plannedDueAt: order.plannedDueAt.toISOString(),
      lateGraceMinutes: order.policyVersion.lateGraceMinutes,
      graceDeadline: graceDeadline.toISOString(),
      overdueMinutes,
      activeUnits: activeItems.map((item) => ({ itemId: item.id, unitId: item.unitId })),
      reasonCodes: ['RENTAL_RETURN_OVERDUE'],
      observedAt: observedAt.toISOString(),
    },
    observedAt: observedAt.toISOString(),
  } satisfies AgentFindingUpsertInput;
}

function activeUnitIds(orders: OverdueOrder[]) {
  return [
    ...new Set(
      orders.flatMap((order) =>
        order.items
          .filter((item) => item.allocationStatus === 'ACTIVE' && item.unitId)
          .map((item) => item.unitId!),
      ),
    ),
  ];
}

async function downstreamRiskOrderIds(
  orders: OverdueOrder[],
  observedAt: Date,
  lookaheadMinutes: number,
  database: Pick<Prisma.TransactionClient, 'rentalOrder'> = prisma,
) {
  const unitIds = activeUnitIds(orders);
  if (unitIds.length === 0) return new Set<string>();
  const horizon = new Date(observedAt.getTime() + lookaheadMinutes * 60_000);
  const nextOrders = await database.rentalOrder.findMany({
    where: {
      status: { in: [...NEXT_ORDER_STATES] },
      plannedStartAt: { gte: observedAt, lte: horizon },
      items: {
        some: {
          unitId: { in: unitIds },
          allocationStatus: 'CONFIRMED',
        },
      },
    },
    select: overdueOrderSelect,
  });
  const suppressed = new Set<string>();
  for (const orderA of orders) {
    for (const itemA of orderA.items) {
      if (!itemA.unitId || itemA.allocationStatus !== 'ACTIVE') continue;
      for (const orderB of nextOrders) {
        if (orderB.id === orderA.id) continue;
        const risk = buildPreviousRentalRisk(
          {
            orderA,
            orderB,
            unitId: itemA.unitId,
          } satisfies PreviousRentalRiskParts,
          observedAt,
          lookaheadMinutes,
        );
        if (risk) {
          suppressed.add(orderA.id);
          break;
        }
      }
      if (suppressed.has(orderA.id)) break;
    }
  }
  return suppressed;
}

export async function getOverdueRentalContext(
  actor: AuthenticatedActor,
  input: { orderId: string },
) {
  const observedAt = new Date();
  const snapshot = await prisma.$transaction(async (tx) => {
    const order = await tx.rentalOrder.findUnique({
      where: { id: input.orderId },
      select: overdueOrderSelect,
    });
    const suppressed = order
      ? await downstreamRiskOrderIds([order], observedAt, env.AGENT_READINESS_LOOKAHEAD_MINUTES, tx)
      : new Set<string>();
    return { order, suppressed };
  });
  const { order, suppressed } = snapshot;
  if (!order) throw new AppError(404, 'RENTAL_ORDER_NOT_FOUND', 'Rental order not found');
  assertPermission(actor, {
    module: 'rentals',
    action: 'read',
    branchId: order.pickupBranchId,
  });
  const risk = buildOverdueReturnRisk(order, observedAt, suppressed.has(order.id));
  const graceDeadline = new Date(
    order.plannedDueAt.getTime() + Math.max(0, order.policyVersion.lateGraceMinutes) * 60_000,
  );
  const activeItems = order.items.filter(
    (item) => item.allocationStatus === 'ACTIVE' && item.unitId,
  );
  return {
    ruleCode: RENTAL_RETURN_OVERDUE_RULE,
    observedAt: observedAt.toISOString(),
    riskStillPresent: risk !== null,
    primaryOrder: {
      id: order.id,
      status: order.status,
      pickupBranchId: order.pickupBranchId,
      plannedStartAt: order.plannedStartAt.toISOString(),
      plannedDueAt: order.plannedDueAt.toISOString(),
      version: order.version,
    },
    lateGraceMinutes: order.policyVersion.lateGraceMinutes,
    graceDeadline: graceDeadline.toISOString(),
    overdueMinutes: Math.max(
      0,
      Math.floor((observedAt.getTime() - graceDeadline.getTime()) / 60_000),
    ),
    activeUnits: activeItems.map((item) => ({ itemId: item.id, unitId: item.unitId })),
    downstreamReadinessRisk: suppressed.has(order.id),
    escalationRequired:
      observedAt.getTime() - graceDeadline.getTime() > ESCALATION_MINUTES * 60_000,
  };
}

export async function processOverdueRentalReturns(
  observedAt = new Date(),
  lookaheadMinutes = env.AGENT_READINESS_LOOKAHEAD_MINUTES,
  batchSize = env.AGENT_OVERDUE_RETURN_BATCH_SIZE,
  client: OverdueAgentClient = defaultAgentClient,
  findingCursor?: string,
) {
  const openPage = await client.listOpen(findingCursor, batchSize);
  const referencedIds = [...new Set(openPage.items.map((finding) => finding.primaryEntityId))];
  const referencedOrders = referencedIds.length
    ? await prisma.rentalOrder.findMany({
        where: { id: { in: referencedIds } },
        select: overdueOrderSelect,
      })
    : [];
  const referencedById = new Map(referencedOrders.map((order) => [order.id, order]));
  const referencedSuppressed = await downstreamRiskOrderIds(
    referencedOrders,
    observedAt,
    lookaheadMinutes,
  );
  let resolved = 0;
  let upserted = 0;
  let staleObservations = 0;
  let failedCalls = 0;
  const activeDedupeKeys = new Set<string>();

  for (const finding of openPage.items) {
    const order = referencedById.get(finding.primaryEntityId);
    const risk = order
      ? buildOverdueReturnRisk(order, observedAt, referencedSuppressed.has(order.id))
      : null;
    if (risk?.dedupeKey === finding.dedupeKey) {
      await client.upsert(risk);
      activeDedupeKeys.add(risk.dedupeKey);
      upserted += 1;
      continue;
    }
    try {
      const result = await client.resolve(finding.dedupeKey, observedAt, {
        reason: referencedSuppressed.has(finding.primaryEntityId)
          ? 'SUPERSEDED_BY_DOWNSTREAM_READINESS_RISK'
          : 'RISK_NO_LONGER_PRESENT',
        observedAt: observedAt.toISOString(),
      });
      if (result.outcome === 'STALE') staleObservations += 1;
      else resolved += 1;
    } catch (error) {
      if (error instanceof AppError && error.code === 'AGENT_FINDING_RESOLUTION_CONFLICT') {
        failedCalls += 1;
        continue;
      }
      throw error;
    }
  }

  let candidates = 0;
  let risks = 0;
  let candidateCursor: { plannedDueAt: Date; id: string } | undefined;
  while (true) {
    const page = await prisma.rentalOrder.findMany({
      where: {
        status: 'ACTIVE',
        plannedDueAt: { lt: observedAt },
        items: { some: { unitId: { not: null }, allocationStatus: 'ACTIVE' } },
        ...(candidateCursor
          ? {
              OR: [
                { plannedDueAt: { gt: candidateCursor.plannedDueAt } },
                { plannedDueAt: candidateCursor.plannedDueAt, id: { gt: candidateCursor.id } },
              ],
            }
          : {}),
      },
      select: overdueOrderSelect,
      orderBy: [{ plannedDueAt: 'asc' }, { id: 'asc' }],
      take: batchSize,
    });
    if (page.length === 0) break;
    candidates += page.length;
    const suppressed = await downstreamRiskOrderIds(page, observedAt, lookaheadMinutes);
    for (const order of page) {
      const risk = buildOverdueReturnRisk(order, observedAt, suppressed.has(order.id));
      if (!risk) continue;
      risks += 1;
      if (activeDedupeKeys.has(risk.dedupeKey)) continue;
      await client.upsert(risk);
      upserted += 1;
    }
    const last = page.at(-1)!;
    candidateCursor = { plannedDueAt: last.plannedDueAt, id: last.id };
    if (page.length < batchSize) break;
  }
  return {
    candidates,
    risks,
    upserted,
    resolved,
    staleObservations,
    failedCalls,
    nextFindingCursor: openPage.nextCursor,
  };
}

export interface OverdueRentalSchedulerOptions {
  enabled?: boolean;
  intervalMilliseconds?: number;
  lookaheadMinutes?: number;
  batchSize?: number;
  process?: typeof processOverdueRentalReturns;
}

export function startOverdueRentalDetection(options: OverdueRentalSchedulerOptions = {}) {
  const enabled = options.enabled ?? env.AGENT_OVERDUE_RETURN_DETECTION_ENABLED;
  if (!enabled) return { stop: () => undefined };
  const intervalMilliseconds = options.intervalMilliseconds ?? env.AGENT_OVERDUE_RETURN_INTERVAL_MS;
  const lookaheadMinutes = options.lookaheadMinutes ?? env.AGENT_READINESS_LOOKAHEAD_MINUTES;
  const batchSize = options.batchSize ?? env.AGENT_OVERDUE_RETURN_BATCH_SIZE;
  const process = options.process ?? processOverdueRentalReturns;
  let running = false;
  let findingCursor: string | undefined;
  const run = async () => {
    if (running) return;
    running = true;
    const startedAt = Date.now();
    try {
      const result = await process(
        new Date(),
        lookaheadMinutes,
        batchSize,
        defaultAgentClient,
        findingCursor,
      );
      findingCursor = result.nextFindingCursor ?? undefined;
      logger.info(
        { ...result, durationMs: Date.now() - startedAt },
        'Overdue rental detection completed',
      );
    } catch (error: unknown) {
      logger.error(
        { err: error, durationMs: Date.now() - startedAt },
        'Overdue rental detection failed',
      );
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(() => void run(), intervalMilliseconds);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}
