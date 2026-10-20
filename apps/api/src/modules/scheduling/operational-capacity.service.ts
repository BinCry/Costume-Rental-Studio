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

export const OPERATIONAL_CAPACITY_SHORTFALL_RULE = 'OPERATIONAL_CAPACITY_SHORTFALL' as const;
const RULE_VERSION = 'v1' as const;
const WORKLOAD_DETAIL_LIMIT = 100;

const capacityWindowSelect = {
  id: true,
  branchId: true,
  startsAt: true,
  endsAt: true,
  availableMinutes: true,
  updatedAt: true,
} as const;

type CapacityWindow = Prisma.BranchCapacityWindowGetPayload<{
  select: typeof capacityWindowSelect;
}>;

const defaultAgentClient = {
  listOpen: (cursor?: string, limit = 100) =>
    listOpenRentalReadinessFindings(cursor, limit, OPERATIONAL_CAPACITY_SHORTFALL_RULE),
  upsert: upsertRentalReadinessFinding,
  resolve: (dedupeKey: string, observedAt: Date, evidence: Record<string, unknown>) =>
    resolveRentalReadinessFinding(
      dedupeKey,
      observedAt,
      evidence,
      OPERATIONAL_CAPACITY_SHORTFALL_RULE,
    ),
};

type CapacityAgentClient = typeof defaultAgentClient;

function dedupeKey(window: CapacityWindow) {
  return [
    OPERATIONAL_CAPACITY_SHORTFALL_RULE,
    RULE_VERSION,
    window.branchId,
    window.startsAt.toISOString(),
    window.endsAt.toISOString(),
  ].join(':');
}

function severity(
  gapMinutes: number,
  availableMinutes: number,
): AgentFindingUpsertInput['severity'] {
  const ratio = gapMinutes / Math.max(availableMinutes, 1);
  if (ratio > 1) return 'CRITICAL';
  if (ratio >= 0.5) return 'HIGH';
  if (ratio >= 0.2) return 'MEDIUM';
  return 'LOW';
}

export function remainingAvailableMinutes(window: CapacityWindow, observedAt: Date) {
  if (observedAt <= window.startsAt) return window.availableMinutes;
  if (observedAt >= window.endsAt) return 0;
  const totalMilliseconds = window.endsAt.getTime() - window.startsAt.getTime();
  const remainingMilliseconds = window.endsAt.getTime() - observedAt.getTime();
  return Math.floor(window.availableMinutes * (remainingMilliseconds / totalMilliseconds));
}

async function workloadForWindow(
  window: CapacityWindow,
  database: Pick<Prisma.TransactionClient, 'unitBlock'> = prisma,
) {
  const where = {
    capacityWindowId: window.id,
    status: { in: ['PLANNED', 'IN_PROGRESS'] },
    unit: { currentBranchId: window.branchId },
  } satisfies Prisma.UnitBlockWhereInput;
  const [
    plannedTotals,
    inProgressTotals,
    inProgressMissingEstimateTotals,
    blocks,
    missingEffortBlocks,
  ] = await Promise.all([
    database.unitBlock.aggregate({
      where: { ...where, status: 'PLANNED' },
      _count: { _all: true, estimatedEffortMinutes: true },
      _sum: { estimatedEffortMinutes: true },
    }),
    database.unitBlock.aggregate({
      where: { ...where, status: 'IN_PROGRESS' },
      _count: { _all: true, estimatedEffortMinutes: true, remainingEffortMinutes: true },
      _sum: { estimatedEffortMinutes: true, remainingEffortMinutes: true },
    }),
    database.unitBlock.aggregate({
      where: { ...where, status: 'IN_PROGRESS', estimatedEffortMinutes: null },
      _sum: { remainingEffortMinutes: true },
    }),
    database.unitBlock.findMany({
      where,
      select: {
        id: true,
        unitId: true,
        blockType: true,
        status: true,
        blockedUntil: true,
        estimatedEffortMinutes: true,
        remainingEffortMinutes: true,
      },
      orderBy: [{ blockedUntil: 'asc' }, { id: 'asc' }],
      take: WORKLOAD_DETAIL_LIMIT,
    }),
    database.unitBlock.findMany({
      where: {
        ...where,
        OR: [
          { status: 'PLANNED', estimatedEffortMinutes: null },
          { status: 'IN_PROGRESS', remainingEffortMinutes: null },
        ],
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: WORKLOAD_DETAIL_LIMIT,
    }),
  ]);
  const workloadCount = plannedTotals._count._all + inProgressTotals._count._all;
  const missingEffortCount =
    plannedTotals._count._all -
    plannedTotals._count.estimatedEffortMinutes +
    (inProgressTotals._count._all - inProgressTotals._count.remainingEffortMinutes);
  const missingEffortBlockIds = missingEffortBlocks.map((block) => block.id);
  const remainingRequiredMinutes =
    (plannedTotals._sum.estimatedEffortMinutes ?? 0) +
    (inProgressTotals._sum.remainingEffortMinutes ?? 0);
  const requiredMinutes =
    (plannedTotals._sum.estimatedEffortMinutes ?? 0) +
    (inProgressTotals._sum.estimatedEffortMinutes ?? 0) +
    (inProgressMissingEstimateTotals._sum.remainingEffortMinutes ?? 0);
  return {
    blocks: blocks.map((block) => ({
      ...block,
      remainingWorkMinutes:
        block.status === 'IN_PROGRESS'
          ? block.remainingEffortMinutes
          : block.estimatedEffortMinutes,
    })),
    workloadCount,
    workloadTruncated: workloadCount > WORKLOAD_DETAIL_LIMIT,
    missingEffortCount,
    missingEffortBlockIds,
    missingEffortTruncated: missingEffortCount > WORKLOAD_DETAIL_LIMIT,
    requiredMinutes,
    remainingRequiredMinutes,
  };
}

export async function buildCapacityShortfallRisk(
  window: CapacityWindow,
  observedAt: Date,
  database: Pick<Prisma.TransactionClient, 'unitBlock'> = prisma,
) {
  if (observedAt >= window.endsAt) return null;
  const workload = await workloadForWindow(window, database);
  if (workload.workloadCount === 0 || workload.missingEffortCount > 0) return null;
  const remainingCapacity = remainingAvailableMinutes(window, observedAt);
  const gapMinutes = workload.remainingRequiredMinutes - remainingCapacity;
  if (gapMinutes <= 0) return null;
  return {
    ruleCode: OPERATIONAL_CAPACITY_SHORTFALL_RULE,
    ruleVersion: RULE_VERSION,
    dedupeKey: dedupeKey(window),
    branchId: window.branchId,
    primaryEntityId: window.branchId,
    affectedEntityId: null,
    unitId: null,
    windowStart: window.startsAt.toISOString(),
    windowEnd: window.endsAt.toISOString(),
    severity: severity(gapMinutes, remainingCapacity),
    deadlineAt: window.endsAt.toISOString(),
    evidence: {
      primaryEntityType: 'BRANCH',
      capacityWindowId: window.id,
      capacityWindowUpdatedAt: window.updatedAt.toISOString(),
      availableMinutes: window.availableMinutes,
      remainingAvailableMinutes: remainingCapacity,
      requiredMinutes: workload.requiredMinutes,
      remainingRequiredMinutes: workload.remainingRequiredMinutes,
      capacityGapMinutes: gapMinutes,
      workloadCount: workload.workloadCount,
      workloadTruncated: workload.workloadTruncated,
      workload: workload.blocks.map((block) => ({
        blockId: block.id,
        unitId: block.unitId,
        blockType: block.blockType,
        status: block.status,
        deadlineAt: block.blockedUntil.toISOString(),
        estimatedEffortMinutes: block.estimatedEffortMinutes,
        remainingEffortMinutes: block.remainingEffortMinutes,
        remainingWorkMinutes: block.remainingWorkMinutes,
      })),
      reasonCodes: ['OPERATIONAL_CAPACITY_SHORTFALL'],
      observedAt: observedAt.toISOString(),
    },
    observedAt: observedAt.toISOString(),
  } satisfies AgentFindingUpsertInput;
}

async function buildCapacityShortfallRiskSnapshot(windowId: string, observedAt: Date) {
  return prisma.$transaction(
    async (tx) => {
      const window = await tx.branchCapacityWindow.findUnique({
        where: { id: windowId },
        select: capacityWindowSelect,
      });
      return window ? buildCapacityShortfallRisk(window, observedAt, tx) : null;
    },
    { isolationLevel: 'RepeatableRead' },
  );
}

export async function getOperationalCapacityContext(
  actor: AuthenticatedActor,
  input: { branchId: string; startsAt: Date; endsAt: Date },
) {
  assertPermission(actor, { module: 'inventory', action: 'read', branchId: input.branchId });
  const observedAt = new Date();
  const snapshot = await prisma.$transaction(
    async (tx) => {
      const window = await tx.branchCapacityWindow.findFirst({
        where: { branchId: input.branchId, startsAt: input.startsAt, endsAt: input.endsAt },
        select: capacityWindowSelect,
      });
      const workload = window ? await workloadForWindow(window, tx) : null;
      return { window, workload };
    },
    { isolationLevel: 'RepeatableRead' },
  );
  if (!snapshot.window)
    throw new AppError(404, 'CAPACITY_WINDOW_NOT_FOUND', 'Capacity window not found');
  const { window, workload } = snapshot;
  const completeData = workload!.missingEffortCount === 0;
  const remainingCapacity = remainingAvailableMinutes(window, observedAt);
  const gapMinutes = workload!.remainingRequiredMinutes - remainingCapacity;
  return {
    ruleCode: OPERATIONAL_CAPACITY_SHORTFALL_RULE,
    observedAt: observedAt.toISOString(),
    riskStillPresent: observedAt < window.endsAt && completeData && gapMinutes > 0,
    branchId: window.branchId,
    capacityWindow: {
      id: window.id,
      startsAt: window.startsAt.toISOString(),
      endsAt: window.endsAt.toISOString(),
      availableMinutes: window.availableMinutes,
      remainingAvailableMinutes: remainingCapacity,
      updatedAt: window.updatedAt.toISOString(),
    },
    requiredMinutes: workload!.requiredMinutes,
    remainingRequiredMinutes: workload!.remainingRequiredMinutes,
    capacityGapMinutes: Math.max(0, gapMinutes),
    completeData,
    missingEffortCount: workload!.missingEffortCount,
    missingEffortBlockIds: workload!.missingEffortBlockIds,
    missingEffortTruncated: workload!.missingEffortTruncated,
    workloadCount: workload!.workloadCount,
    workloadTruncated: workload!.workloadTruncated,
    workload: workload!.blocks.map((block) => ({
      blockId: block.id,
      unitId: block.unitId,
      blockType: block.blockType,
      status: block.status,
      deadlineAt: block.blockedUntil.toISOString(),
      estimatedEffortMinutes: block.estimatedEffortMinutes,
      remainingEffortMinutes: block.remainingEffortMinutes,
      remainingWorkMinutes: block.remainingWorkMinutes,
    })),
  };
}

export async function processOperationalCapacityShortfalls(
  observedAt = new Date(),
  lookaheadMinutes = env.AGENT_CAPACITY_LOOKAHEAD_MINUTES,
  batchSize = env.AGENT_CAPACITY_BATCH_SIZE,
  client: CapacityAgentClient = defaultAgentClient,
  findingCursor?: string,
) {
  const openPage = await client.listOpen(findingCursor, batchSize);
  let upserted = 0;
  let resolved = 0;
  let staleObservations = 0;
  let failedCalls = 0;
  const activeDedupeKeys = new Set<string>();
  for (const finding of openPage.items) {
    const windowId = finding.evidence.capacityWindowId;
    const risk =
      typeof windowId === 'string'
        ? await buildCapacityShortfallRiskSnapshot(windowId, observedAt)
        : null;
    if (risk?.dedupeKey === finding.dedupeKey) {
      await client.upsert(risk);
      activeDedupeKeys.add(risk.dedupeKey);
      upserted += 1;
    } else {
      try {
        const result = await client.resolve(finding.dedupeKey, observedAt, {
          reason: 'RISK_NO_LONGER_PRESENT',
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
  }

  const horizon = new Date(observedAt.getTime() + lookaheadMinutes * 60_000);
  let risks = 0;
  let candidates = 0;
  let candidateCursor: { startsAt: Date; id: string } | undefined;
  while (true) {
    const windows = await prisma.branchCapacityWindow.findMany({
      where: {
        endsAt: { gt: observedAt },
        startsAt: { lte: horizon },
        ...(candidateCursor
          ? {
              OR: [
                { startsAt: { gt: candidateCursor.startsAt } },
                { startsAt: candidateCursor.startsAt, id: { gt: candidateCursor.id } },
              ],
            }
          : {}),
      },
      select: capacityWindowSelect,
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take: batchSize,
    });
    if (windows.length === 0) break;
    candidates += windows.length;
    for (const window of windows) {
      const risk = await buildCapacityShortfallRiskSnapshot(window.id, observedAt);
      if (!risk) continue;
      risks += 1;
      if (activeDedupeKeys.has(risk.dedupeKey)) continue;
      await client.upsert(risk);
      upserted += 1;
    }
    const last = windows.at(-1)!;
    candidateCursor = { startsAt: last.startsAt, id: last.id };
    if (windows.length < batchSize) break;
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

export function startOperationalCapacityDetection(
  options: {
    enabled?: boolean;
    intervalMilliseconds?: number;
    lookaheadMinutes?: number;
    batchSize?: number;
    process?: typeof processOperationalCapacityShortfalls;
  } = {},
) {
  const enabled = options.enabled ?? env.AGENT_CAPACITY_DETECTION_ENABLED;
  if (!enabled) return { stop: () => undefined };
  const intervalMilliseconds = options.intervalMilliseconds ?? env.AGENT_CAPACITY_INTERVAL_MS;
  const lookaheadMinutes = options.lookaheadMinutes ?? env.AGENT_CAPACITY_LOOKAHEAD_MINUTES;
  const batchSize = options.batchSize ?? env.AGENT_CAPACITY_BATCH_SIZE;
  const process = options.process ?? processOperationalCapacityShortfalls;
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
        'Operational capacity detection completed',
      );
    } catch (error: unknown) {
      logger.error(
        { err: error, durationMs: Date.now() - startedAt },
        'Operational capacity detection failed',
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
