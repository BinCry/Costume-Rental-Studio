import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { assertPermission, type AuthenticatedActor } from '../auth/authorization.js';
import * as rentalService from './rental.service.js';
import {
  listOpenRentalReadinessFindings,
  resolveRentalReadinessFinding,
  upsertRentalReadinessFinding,
  type AgentFindingUpsertInput,
  type RentalReadinessRuleCode,
} from '../agent/agent-internal.service.js';

const PREVIOUS_RENTAL_RULE = 'PREVIOUS_RENTAL_NOT_RETURNED' as const;
const UNIT_NOT_READY_RULE = 'ALLOCATED_UNIT_NOT_READY' as const;
const PREPARATION_DELAY_RULE = 'ORDER_PREPARATION_DELAYED' as const;
const READINESS_RULES = [
  PREVIOUS_RENTAL_RULE,
  UNIT_NOT_READY_RULE,
  PREPARATION_DELAY_RULE,
] as const;
const RULE_VERSION = 'v1' as const;
const ELIGIBLE_NEXT_ORDER_STATES = ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP'] as const;
const PREPARATION_DELAY_STATES = ['CONFIRMED', 'PREPARING'] as const;
const PREPARATION_DELAY_WINDOW_MINUTES = 120;

const defaultAgentClient = {
  listOpen: (ruleCode: RentalReadinessRuleCode, cursor?: string, limit = 100) =>
    listOpenRentalReadinessFindings(cursor, limit, ruleCode),
  upsert: upsertRentalReadinessFinding,
  resolve: (
    ruleCode: RentalReadinessRuleCode,
    dedupeKey: string,
    observedAt: Date,
    evidence: Record<string, unknown>,
  ) => resolveRentalReadinessFinding(dedupeKey, observedAt, evidence, ruleCode),
};

type ReadinessAgentClient = typeof defaultAgentClient;

function severity(deadline: Date, now: Date): AgentFindingUpsertInput['severity'] {
  const remaining = deadline.getTime() - now.getTime();
  if (remaining <= 0) return 'CRITICAL';
  if (remaining <= 2 * 60 * 60_000) return 'HIGH';
  if (remaining <= 6 * 60 * 60_000) return 'MEDIUM';
  return 'LOW';
}

function previousRentalDedupeKey(
  orderBId: string,
  orderAId: string,
  unitId: string,
  plannedStartAt: Date,
) {
  return [
    PREVIOUS_RENTAL_RULE,
    RULE_VERSION,
    orderBId,
    orderAId,
    unitId,
    plannedStartAt.toISOString(),
  ].join(':');
}

function preparationDelayDedupeKey(orderId: string, plannedStartAt: Date) {
  return [PREPARATION_DELAY_RULE, RULE_VERSION, orderId, plannedStartAt.toISOString()].join(':');
}

export interface PreviousRentalRiskParts {
  orderB: {
    id: string;
    status: string;
    pickupBranchId: string;
    plannedStartAt: Date;
    policyVersion: { defaultCleaningBufferMinutes: number };
    items: {
      id: string;
      variantId: string;
      unitId: string | null;
      allocationStatus: string;
      variant: { cleaningBufferMinutes: number | null };
    }[];
  };
  orderA: {
    id: string;
    status: string;
    plannedDueAt: Date;
    items: {
      id: string;
      unitId: string | null;
      allocationStatus: string;
    }[];
  };
  unitId: string;
}

export function buildPreviousRentalRisk(
  parts: PreviousRentalRiskParts,
  observedAt: Date,
  lookaheadMinutes: number,
) {
  const itemB = parts.orderB.items.find(
    (item) => item.unitId === parts.unitId && item.allocationStatus === 'CONFIRMED',
  );
  const itemA = parts.orderA.items.find(
    (item) => item.unitId === parts.unitId && item.allocationStatus === 'ACTIVE',
  );
  if (
    !itemA ||
    !itemB ||
    parts.orderA.status !== 'ACTIVE' ||
    !ELIGIBLE_NEXT_ORDER_STATES.includes(
      parts.orderB.status as (typeof ELIGIBLE_NEXT_ORDER_STATES)[number],
    )
  ) {
    return null;
  }
  const cleaningBufferMinutes =
    itemB.variant.cleaningBufferMinutes ?? parts.orderB.policyVersion.defaultCleaningBufferMinutes;
  const earliestReadyAt = new Date(observedAt.getTime() + cleaningBufferMinutes * 60_000);
  if (earliestReadyAt.getTime() <= parts.orderB.plannedStartAt.getTime()) return null;

  const start = parts.orderB.plannedStartAt;
  return {
    ruleCode: PREVIOUS_RENTAL_RULE,
    ruleVersion: RULE_VERSION,
    dedupeKey: previousRentalDedupeKey(parts.orderB.id, parts.orderA.id, parts.unitId, start),
    branchId: parts.orderB.pickupBranchId,
    primaryEntityId: parts.orderB.id,
    affectedEntityId: parts.orderA.id,
    unitId: parts.unitId,
    windowStart: new Date(start.getTime() - lookaheadMinutes * 60_000).toISOString(),
    windowEnd: start.toISOString(),
    severity: severity(start, observedAt),
    deadlineAt: start.toISOString(),
    evidence: {
      orderAId: parts.orderA.id,
      orderAItemId: itemA.id,
      orderAStatus: parts.orderA.status,
      orderAPlannedDueAt: parts.orderA.plannedDueAt.toISOString(),
      orderBId: parts.orderB.id,
      orderBItemId: itemB.id,
      orderBStatus: parts.orderB.status,
      orderBPlannedStartAt: start.toISOString(),
      unitId: parts.unitId,
      cleaningBufferMinutes,
      earliestReadyAt: earliestReadyAt.toISOString(),
      observedAt: observedAt.toISOString(),
    },
    observedAt: observedAt.toISOString(),
  } satisfies AgentFindingUpsertInput;
}

interface ReadinessUnit {
  id: string;
  unitCode: string;
  variantId: string;
  currentBranchId: string;
  operationalStatus: string;
  conditionGrade: string;
  blocks: {
    id: string;
    blockType: string;
    status: string;
    blockedFrom: Date;
    blockedUntil: Date;
  }[];
  transferItems: {
    transfer: {
      id: string;
      status: string;
      fromBranchId: string;
      toBranchId: string;
    };
  }[];
}

const unitSelect = {
  id: true,
  unitCode: true,
  variantId: true,
  currentBranchId: true,
  operationalStatus: true,
  conditionGrade: true,
  blocks: {
    where: { status: { in: ['PLANNED', 'IN_PROGRESS'] } },
    select: {
      id: true,
      blockType: true,
      status: true,
      blockedFrom: true,
      blockedUntil: true,
    },
  },
  transferItems: {
    where: { transfer: { status: { in: ['REQUESTED', 'APPROVED', 'IN_TRANSIT'] } } },
    select: {
      transfer: {
        select: { id: true, status: true, fromBranchId: true, toBranchId: true },
      },
    },
  },
} satisfies Prisma.CostumeUnitSelect;

type CandidateOrder = PreviousRentalRiskParts['orderB'] & {
  plannedDueAt: Date;
  version: number;
};

function buildAllocatedUnitRisk(
  orderB: CandidateOrder,
  unit: ReadinessUnit | undefined,
  observedAt: Date,
  lookaheadMinutes: number,
) {
  if (
    !unit ||
    !ELIGIBLE_NEXT_ORDER_STATES.includes(
      orderB.status as (typeof ELIGIBLE_NEXT_ORDER_STATES)[number],
    )
  ) {
    return null;
  }
  const itemB = orderB.items.find(
    (item) => item.unitId === unit.id && item.allocationStatus === 'CONFIRMED',
  );
  if (!itemB) return null;

  const relevantBlocks = unit.blocks.filter(
    (block) => block.blockedFrom < orderB.plannedStartAt && block.blockedUntil > observedAt,
  );
  const blockingPastPickup = relevantBlocks.filter(
    (block) => block.blockedUntil > orderB.plannedStartAt,
  );
  const activeTransfers = unit.transferItems.map((item) => item.transfer);
  const scheduledRecoveryBeforePickup =
    ['CLEANING', 'REPAIR'].includes(unit.operationalStatus) &&
    relevantBlocks.length > 0 &&
    blockingPastPickup.length === 0;
  const reasonCodes: string[] = [];
  if (unit.currentBranchId !== orderB.pickupBranchId) reasonCodes.push('WRONG_BRANCH');
  if (activeTransfers.length > 0 || unit.operationalStatus === 'IN_TRANSFER') {
    reasonCodes.push('TRANSFER_ACTIVE');
  }
  if (blockingPastPickup.length > 0) reasonCodes.push('BLOCK_EXTENDS_PAST_PICKUP');
  if (
    unit.operationalStatus !== 'READY' &&
    !scheduledRecoveryBeforePickup &&
    !reasonCodes.includes('TRANSFER_ACTIVE')
  ) {
    reasonCodes.push('STATUS_NOT_READY');
  }
  if (reasonCodes.length === 0) return null;

  const scheduledReadyAt = relevantBlocks.length
    ? new Date(Math.max(...relevantBlocks.map((block) => block.blockedUntil.getTime())))
    : null;
  const start = orderB.plannedStartAt;
  return {
    ruleCode: UNIT_NOT_READY_RULE,
    ruleVersion: RULE_VERSION,
    dedupeKey: [UNIT_NOT_READY_RULE, RULE_VERSION, orderB.id, unit.id, start.toISOString()].join(
      ':',
    ),
    branchId: orderB.pickupBranchId,
    primaryEntityId: orderB.id,
    affectedEntityId: unit.id,
    unitId: unit.id,
    windowStart: new Date(start.getTime() - lookaheadMinutes * 60_000).toISOString(),
    windowEnd: start.toISOString(),
    severity: severity(start, observedAt),
    deadlineAt: start.toISOString(),
    evidence: {
      primaryEntityType: 'RENTAL_ORDER',
      affectedEntityType: 'COSTUME_UNIT',
      orderBId: orderB.id,
      orderBItemId: itemB.id,
      orderBStatus: orderB.status,
      orderBPlannedStartAt: start.toISOString(),
      orderBPlannedDueAt: orderB.plannedDueAt.toISOString(),
      unitId: unit.id,
      unitCode: unit.unitCode,
      unitOperationalStatus: unit.operationalStatus,
      unitCurrentBranchId: unit.currentBranchId,
      reasonCodes,
      scheduledReadyAt: scheduledReadyAt?.toISOString() ?? null,
      blockingBlocks: blockingPastPickup.map((block) => ({
        id: block.id,
        blockType: block.blockType,
        status: block.status,
        blockedFrom: block.blockedFrom.toISOString(),
        blockedUntil: block.blockedUntil.toISOString(),
      })),
      activeTransfers: activeTransfers.map((transfer) => ({
        id: transfer.id,
        status: transfer.status,
        fromBranchId: transfer.fromBranchId,
        toBranchId: transfer.toBranchId,
      })),
      observedAt: observedAt.toISOString(),
    },
    observedAt: observedAt.toISOString(),
  } satisfies AgentFindingUpsertInput;
}

function buildPreparationDelayRisk(
  orderB: CandidateOrder,
  unitsById: Map<string, ReadinessUnit>,
  unitsWithActiveRental: ReadonlySet<string>,
  observedAt: Date,
) {
  if (
    !PREPARATION_DELAY_STATES.includes(orderB.status as (typeof PREPARATION_DELAY_STATES)[number])
  ) {
    return null;
  }
  const remainingMilliseconds = orderB.plannedStartAt.getTime() - observedAt.getTime();
  if (
    remainingMilliseconds < 0 ||
    remainingMilliseconds > PREPARATION_DELAY_WINDOW_MINUTES * 60_000
  ) {
    return null;
  }
  if (
    orderB.items.length === 0 ||
    orderB.items.some((item) => !item.unitId || item.allocationStatus !== 'CONFIRMED')
  ) {
    return null;
  }

  const allocatedUnits: {
    itemId: string;
    unitId: string;
    unitCode: string;
    operationalStatus: string;
  }[] = [];
  for (const item of orderB.items) {
    const unitId = item.unitId!;
    const unit = unitsById.get(unitId);
    if (!unit || unitsWithActiveRental.has(unitId)) return null;
    const hasRelevantBlock = unit.blocks.some(
      (block) => block.blockedFrom < orderB.plannedStartAt && block.blockedUntil > observedAt,
    );
    if (
      unit.variantId !== item.variantId ||
      unit.currentBranchId !== orderB.pickupBranchId ||
      unit.operationalStatus !== 'READY' ||
      hasRelevantBlock ||
      unit.transferItems.length > 0
    ) {
      return null;
    }
    allocatedUnits.push({
      itemId: item.id,
      unitId,
      unitCode: unit.unitCode,
      operationalStatus: unit.operationalStatus,
    });
  }

  const start = orderB.plannedStartAt;
  return {
    ruleCode: PREPARATION_DELAY_RULE,
    ruleVersion: RULE_VERSION,
    dedupeKey: preparationDelayDedupeKey(orderB.id, start),
    branchId: orderB.pickupBranchId,
    primaryEntityId: orderB.id,
    affectedEntityId: null,
    unitId: null,
    windowStart: new Date(
      start.getTime() - PREPARATION_DELAY_WINDOW_MINUTES * 60_000,
    ).toISOString(),
    windowEnd: start.toISOString(),
    severity: severity(start, observedAt),
    deadlineAt: start.toISOString(),
    evidence: {
      primaryEntityType: 'RENTAL_ORDER',
      orderBId: orderB.id,
      orderBStatus: orderB.status,
      orderBVersion: orderB.version,
      orderBPlannedStartAt: start.toISOString(),
      preparationWindowMinutes: PREPARATION_DELAY_WINDOW_MINUTES,
      reasonCodes: ['ORDER_NOT_READY_FOR_PICKUP'],
      allocatedUnits,
      observedAt: observedAt.toISOString(),
    },
    observedAt: observedAt.toISOString(),
  } satisfies AgentFindingUpsertInput;
}

const orderSelect = {
  id: true,
  status: true,
  pickupBranchId: true,
  plannedStartAt: true,
  plannedDueAt: true,
  version: true,
  policyVersion: { select: { defaultCleaningBufferMinutes: true } },
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

/**
 * A deliberately narrow, PII-free snapshot used by the proactive agent.
 * The detector and this context call the same rule builders, so they cannot
 * silently disagree about whether a readiness risk is still present.
 */
export async function getRentalReadinessContext(
  actor: AuthenticatedActor,
  input: {
    ruleCode: RentalReadinessRuleCode;
    primaryOrderId: string;
    affectedOrderId?: string;
    unitId?: string;
  },
) {
  if (input.ruleCode === PREPARATION_DELAY_RULE) {
    const snapshot = await prisma.$transaction(async (tx) => {
      const primary = await tx.rentalOrder.findUnique({
        where: { id: input.primaryOrderId },
        select: orderSelect,
      });
      if (!primary) return { primary: null, units: [], activeItems: [] };
      const unitIds = primary.items
        .map((item) => item.unitId)
        .filter((value): value is string => Boolean(value));
      const [units, activeItems] = unitIds.length
        ? await Promise.all([
            tx.costumeUnit.findMany({ where: { id: { in: unitIds } }, select: unitSelect }),
            tx.rentalOrderItem.findMany({
              where: {
                unitId: { in: unitIds },
                allocationStatus: 'ACTIVE',
                order: { status: 'ACTIVE' },
              },
              select: { unitId: true },
            }),
          ])
        : [[], []];
      return { primary, units, activeItems };
    });
    if (!snapshot.primary) {
      throw new AppError(404, 'RENTAL_ORDER_NOT_FOUND', 'Rental order not found');
    }
    assertPermission(actor, {
      module: 'rentals',
      action: 'read',
      branchId: snapshot.primary.pickupBranchId,
    });
    const observedAt = new Date();
    const unitsById = new Map(snapshot.units.map((unit) => [unit.id, unit]));
    const activeUnitIds = new Set(
      snapshot.activeItems
        .map((item) => item.unitId)
        .filter((value): value is string => Boolean(value)),
    );
    const risk = buildPreparationDelayRisk(snapshot.primary, unitsById, activeUnitIds, observedAt);
    return {
      ruleCode: input.ruleCode,
      observedAt: observedAt.toISOString(),
      riskStillPresent: risk !== null,
      primaryOrder: {
        id: snapshot.primary.id,
        status: snapshot.primary.status,
        pickupBranchId: snapshot.primary.pickupBranchId,
        plannedStartAt: snapshot.primary.plannedStartAt.toISOString(),
        plannedDueAt: snapshot.primary.plannedDueAt.toISOString(),
        version: snapshot.primary.version,
        items: snapshot.primary.items.map((item) => ({
          id: item.id,
          variantId: item.variantId,
          unitId: item.unitId,
          allocationStatus: item.allocationStatus,
        })),
      },
      affectedOrder: null,
      currentUnit: null,
      cleaningBufferMinutes: null,
      earliestReadyAt: null,
      reasonCodes: risk ? ['ORDER_NOT_READY_FOR_PICKUP'] : [],
      allocatedUnits: snapshot.units.map((unit) => ({
        id: unit.id,
        unitCode: unit.unitCode,
        currentBranchId: unit.currentBranchId,
        operationalStatus: unit.operationalStatus,
        conditionGrade: unit.conditionGrade,
      })),
      replacementUnits: [],
    };
  }
  if (!input.unitId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'unitId is required for this readiness rule');
  }
  let primary: CandidateOrder | null;
  let affected: CandidateOrder | null;
  let currentUnit: ReadinessUnit | null;
  if (input.affectedOrderId) {
    const snapshot = await prisma.$transaction([
      prisma.rentalOrder.findUnique({ where: { id: input.primaryOrderId }, select: orderSelect }),
      prisma.rentalOrder.findUnique({ where: { id: input.affectedOrderId }, select: orderSelect }),
      prisma.costumeUnit.findUnique({ where: { id: input.unitId }, select: unitSelect }),
    ]);
    [primary, affected, currentUnit] = snapshot;
  } else {
    const snapshot = await prisma.$transaction([
      prisma.rentalOrder.findUnique({ where: { id: input.primaryOrderId }, select: orderSelect }),
      prisma.costumeUnit.findUnique({ where: { id: input.unitId }, select: unitSelect }),
    ]);
    [primary, currentUnit] = snapshot;
    affected = null;
  }
  if (!primary) {
    throw new AppError(404, 'RENTAL_ORDER_NOT_FOUND', 'Rental order not found');
  }
  assertPermission(actor, { module: 'rentals', action: 'read', branchId: primary.pickupBranchId });

  const primaryItem = primary.items.find(
    (item) => item.unitId === input.unitId && item.allocationStatus === 'CONFIRMED',
  );
  const affectedItem = affected?.items.find(
    (item) => item.unitId === input.unitId && item.allocationStatus === 'ACTIVE',
  );
  const observedAt = new Date();
  if (!primaryItem) {
    return {
      ruleCode: input.ruleCode,
      observedAt: observedAt.toISOString(),
      riskStillPresent: false,
      primaryOrder: {
        id: primary.id,
        status: primary.status,
        pickupBranchId: primary.pickupBranchId,
        plannedStartAt: primary.plannedStartAt.toISOString(),
        plannedDueAt: primary.plannedDueAt.toISOString(),
        version: primary.version,
      },
      affectedOrder: null,
      currentUnit: currentUnit ?? { id: input.unitId },
      replacementUnits: [],
    };
  }

  const risk =
    input.ruleCode === PREVIOUS_RENTAL_RULE && affected && affectedItem
      ? buildPreviousRentalRisk(
          {
            orderB: primary,
            orderA: affected,
            unitId: input.unitId,
          },
          observedAt,
          env.AGENT_READINESS_LOOKAHEAD_MINUTES,
        )
      : input.ruleCode === UNIT_NOT_READY_RULE
        ? buildAllocatedUnitRisk(
            primary,
            currentUnit ?? undefined,
            observedAt,
            env.AGENT_READINESS_LOOKAHEAD_MINUTES,
          )
        : null;
  const availability = risk
    ? await rentalService.checkAvailability(actor, {
        variantId: primaryItem.variantId,
        pickupBranchId: primary.pickupBranchId,
        plannedStartAt: primary.plannedStartAt,
        plannedDueAt: primary.plannedDueAt,
      })
    : { units: [] };

  return {
    ruleCode: input.ruleCode,
    observedAt: observedAt.toISOString(),
    riskStillPresent: risk !== null,
    primaryOrder: {
      id: primary.id,
      status: primary.status,
      pickupBranchId: primary.pickupBranchId,
      plannedStartAt: primary.plannedStartAt.toISOString(),
      plannedDueAt: primary.plannedDueAt.toISOString(),
      version: primary.version,
      item: { id: primaryItem.id, variantId: primaryItem.variantId, unitId: primaryItem.unitId },
    },
    affectedOrder:
      affected && affectedItem
        ? {
            id: affected.id,
            status: affected.status,
            plannedDueAt: affected.plannedDueAt.toISOString(),
            version: affected.version,
            item: { id: affectedItem.id, unitId: affectedItem.unitId },
          }
        : null,
    currentUnit: currentUnit
      ? {
          id: currentUnit.id,
          unitCode: currentUnit.unitCode,
          currentBranchId: currentUnit.currentBranchId,
          operationalStatus: currentUnit.operationalStatus,
          conditionGrade: currentUnit.conditionGrade,
        }
      : { id: input.unitId },
    cleaningBufferMinutes:
      risk?.ruleCode === PREVIOUS_RENTAL_RULE ? risk.evidence.cleaningBufferMinutes : null,
    earliestReadyAt:
      risk?.ruleCode === PREVIOUS_RENTAL_RULE
        ? risk.evidence.earliestReadyAt
        : risk?.ruleCode === UNIT_NOT_READY_RULE
          ? risk.evidence.scheduledReadyAt
          : null,
    reasonCodes: risk?.ruleCode === UNIT_NOT_READY_RULE ? risk.evidence.reasonCodes : [],
    replacementUnits: availability.units
      .filter((unit) => unit.id !== input.unitId)
      .map((unit) => ({
        id: unit.id,
        unitCode: unit.unitCode,
        conditionGrade: unit.conditionGrade,
      })),
  };
}

export async function processRentalReadiness(
  observedAt = new Date(),
  lookaheadMinutes = env.AGENT_READINESS_LOOKAHEAD_MINUTES,
  batchSize = env.AGENT_READINESS_BATCH_SIZE,
  client: ReadinessAgentClient = defaultAgentClient,
  findingCursors: Partial<Record<RentalReadinessRuleCode, string>> = {},
) {
  const findingPages = await Promise.all(
    READINESS_RULES.map(async (ruleCode) => ({
      ruleCode,
      page: await client.listOpen(ruleCode, findingCursors[ruleCode], batchSize),
    })),
  );
  const openFindings = findingPages.flatMap(({ page }) => page.items);
  const referencedOrderIds = [
    ...new Set(
      openFindings
        .flatMap((finding) =>
          finding.ruleCode === PREVIOUS_RENTAL_RULE
            ? [finding.primaryEntityId, finding.affectedEntityId]
            : [finding.primaryEntityId],
        )
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const referencedUnitIds = [
    ...new Set(
      openFindings
        .filter((finding) => finding.ruleCode === UNIT_NOT_READY_RULE)
        .map((finding) => finding.unitId)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const referencedOrders = referencedOrderIds.length
    ? await prisma.rentalOrder.findMany({
        where: { id: { in: referencedOrderIds } },
        select: orderSelect,
      })
    : [];
  const preparationOrderIds = new Set(
    openFindings
      .filter((finding) => finding.ruleCode === PREPARATION_DELAY_RULE)
      .map((finding) => finding.primaryEntityId),
  );
  const preparationUnitIds = referencedOrders
    .filter((order) => preparationOrderIds.has(order.id))
    .flatMap((order) => order.items.map((item) => item.unitId))
    .filter((value): value is string => Boolean(value));
  const allReferencedUnitIds = [...new Set([...referencedUnitIds, ...preparationUnitIds])];
  const [referencedUnits, referencedActiveItems] = allReferencedUnitIds.length
    ? await Promise.all([
        prisma.costumeUnit.findMany({
          where: { id: { in: allReferencedUnitIds } },
          select: unitSelect,
        }),
        prisma.rentalOrderItem.findMany({
          where: {
            unitId: { in: allReferencedUnitIds },
            allocationStatus: 'ACTIVE',
            order: { status: 'ACTIVE' },
          },
          select: { unitId: true },
        }),
      ])
    : [[], []];
  const referencedById = new Map(referencedOrders.map((order) => [order.id, order]));
  const referencedUnitsById = new Map(referencedUnits.map((unit) => [unit.id, unit]));
  const referencedActiveUnitIds = new Set(
    referencedActiveItems
      .map((item) => item.unitId)
      .filter((value): value is string => Boolean(value)),
  );

  let resolved = 0;
  let upserted = 0;
  let staleObservations = 0;
  let failedCalls = 0;
  const activeDedupeKeys = new Set<string>();

  for (const finding of openFindings) {
    const orderB = referencedById.get(finding.primaryEntityId);
    const risk =
      finding.ruleCode === PREVIOUS_RENTAL_RULE
        ? (() => {
            if (!finding.affectedEntityId || !finding.unitId) return null;
            const orderA = referencedById.get(finding.affectedEntityId);
            return orderA && orderB?.pickupBranchId === finding.branchId
              ? buildPreviousRentalRisk(
                  { orderA, orderB, unitId: finding.unitId },
                  observedAt,
                  lookaheadMinutes,
                )
              : null;
          })()
        : finding.ruleCode === UNIT_NOT_READY_RULE &&
            orderB?.pickupBranchId === finding.branchId &&
            finding.unitId
          ? buildAllocatedUnitRisk(
              orderB,
              referencedUnitsById.get(finding.unitId),
              observedAt,
              lookaheadMinutes,
            )
          : finding.ruleCode === PREPARATION_DELAY_RULE &&
              orderB?.pickupBranchId === finding.branchId
            ? buildPreparationDelayRisk(
                orderB,
                referencedUnitsById,
                referencedActiveUnitIds,
                observedAt,
              )
            : null;
    if (risk?.dedupeKey === finding.dedupeKey) {
      await client.upsert(risk);
      activeDedupeKeys.add(risk.dedupeKey);
      upserted += 1;
      continue;
    }
    try {
      const result = await client.resolve(finding.ruleCode, finding.dedupeKey, observedAt, {
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

  const horizon = new Date(observedAt.getTime() + lookaheadMinutes * 60_000);
  let candidates = 0;
  let risks = 0;
  let candidateCursor: { plannedStartAt: Date; id: string } | undefined;
  while (true) {
    const candidatePage = await prisma.rentalOrder.findMany({
      where: {
        status: { in: [...ELIGIBLE_NEXT_ORDER_STATES] },
        plannedStartAt: { gte: observedAt, lte: horizon },
        items: { some: { unitId: { not: null }, allocationStatus: 'CONFIRMED' } },
        ...(candidateCursor
          ? {
              OR: [
                { plannedStartAt: { gt: candidateCursor.plannedStartAt } },
                {
                  plannedStartAt: candidateCursor.plannedStartAt,
                  id: { gt: candidateCursor.id },
                },
              ],
            }
          : {}),
      },
      select: orderSelect,
      orderBy: [{ plannedStartAt: 'asc' }, { id: 'asc' }],
      take: batchSize,
    });
    if (candidatePage.length === 0) break;
    candidates += candidatePage.length;

    const candidateUnitIds = [
      ...new Set(
        candidatePage.flatMap((order) =>
          order.items
            .filter((item) => item.unitId && item.allocationStatus === 'CONFIRMED')
            .map((item) => item.unitId!),
        ),
      ),
    ];
    const [previousItems, candidateUnits] = candidateUnitIds.length
      ? await Promise.all([
          prisma.rentalOrderItem.findMany({
            where: {
              unitId: { in: candidateUnitIds },
              allocationStatus: 'ACTIVE',
              order: { status: 'ACTIVE' },
            },
            select: {
              unitId: true,
              order: { select: orderSelect },
            },
          }),
          prisma.costumeUnit.findMany({
            where: { id: { in: candidateUnitIds } },
            select: unitSelect,
          }),
        ])
      : [[], []];
    const previousByUnit = new Map(previousItems.map((item) => [item.unitId!, item.order]));
    const unitsById = new Map(candidateUnits.map((unit) => [unit.id, unit]));
    const unitsWithActiveRental = new Set(previousItems.map((item) => item.unitId!));

    for (const orderB of candidatePage) {
      for (const itemB of orderB.items) {
        if (!itemB.unitId || itemB.allocationStatus !== 'CONFIRMED') continue;
        const orderA = previousByUnit.get(itemB.unitId);
        const previousRisk =
          orderA && orderA.id !== orderB.id
            ? buildPreviousRentalRisk(
                { orderA, orderB, unitId: itemB.unitId },
                observedAt,
                lookaheadMinutes,
              )
            : null;
        const unitRisk = buildAllocatedUnitRisk(
          orderB,
          unitsById.get(itemB.unitId),
          observedAt,
          lookaheadMinutes,
        );
        for (const risk of [previousRisk, unitRisk]) {
          if (!risk) continue;
          risks += 1;
          if (activeDedupeKeys.has(risk.dedupeKey)) continue;
          await client.upsert(risk);
          upserted += 1;
        }
      }
      const preparationRisk = buildPreparationDelayRisk(
        orderB,
        unitsById,
        unitsWithActiveRental,
        observedAt,
      );
      if (preparationRisk) {
        risks += 1;
        if (!activeDedupeKeys.has(preparationRisk.dedupeKey)) {
          await client.upsert(preparationRisk);
          upserted += 1;
        }
      }
    }

    const lastCandidate = candidatePage.at(-1)!;
    candidateCursor = { plannedStartAt: lastCandidate.plannedStartAt, id: lastCandidate.id };
    if (candidatePage.length < batchSize) break;
  }

  const nextFindingCursors = Object.fromEntries(
    findingPages
      .filter(({ page }) => page.nextCursor)
      .map(({ ruleCode, page }) => [ruleCode, page.nextCursor]),
  ) as Partial<Record<RentalReadinessRuleCode, string>>;
  return {
    candidates,
    risks,
    upserted,
    resolved,
    staleObservations,
    failedCalls,
    nextFindingCursors,
  };
}

export interface RentalReadinessSchedulerOptions {
  enabled?: boolean;
  intervalMilliseconds?: number;
  lookaheadMinutes?: number;
  batchSize?: number;
  process?: typeof processRentalReadiness;
}

export function startRentalReadinessDetection(options: RentalReadinessSchedulerOptions = {}) {
  const enabled = options.enabled ?? env.AGENT_READINESS_DETECTION_ENABLED;
  if (!enabled) return { stop: () => undefined };
  const intervalMilliseconds = options.intervalMilliseconds ?? env.AGENT_READINESS_INTERVAL_MS;
  const lookaheadMinutes = options.lookaheadMinutes ?? env.AGENT_READINESS_LOOKAHEAD_MINUTES;
  const batchSize = options.batchSize ?? env.AGENT_READINESS_BATCH_SIZE;
  const process = options.process ?? processRentalReadiness;
  let running = false;
  let findingCursors: Partial<Record<RentalReadinessRuleCode, string>> = {};

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
        findingCursors,
      );
      findingCursors = result.nextFindingCursors;
      logger.info(
        { ...result, durationMs: Date.now() - startedAt },
        'Rental readiness detection completed',
      );
    } catch (error: unknown) {
      logger.error(
        { err: error, durationMs: Date.now() - startedAt },
        'Rental readiness detection failed',
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
