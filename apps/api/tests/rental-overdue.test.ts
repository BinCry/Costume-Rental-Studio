import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthenticatedActor } from '../src/modules/auth/authorization.js';

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.WEB_URL = 'http://localhost:3000';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/costume_rental_test';
process.env.AI_SERVICE_URL = 'http://localhost:8001';
process.env.AI_INTERNAL_API_KEY = 'test-ai-internal-key-at-least-32-characters';

const mocks = vi.hoisted(() => ({
  orderFindMany: vi.fn(),
  orderFindUnique: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    rentalOrder: { findMany: mocks.orderFindMany, findUnique: mocks.orderFindUnique },
    $transaction: mocks.transaction,
  },
}));

const {
  buildOverdueReturnRisk,
  getOverdueRentalContext,
  processOverdueRentalReturns,
  startOverdueRentalDetection,
} = await import('../src/modules/rentals/rental-overdue.service.js');
type OverdueOrderInput = Parameters<typeof buildOverdueReturnRisk>[0];

const observedAt = new Date('2026-10-19T12:00:00.000Z');
const branchId = '10000000-0000-4000-8000-000000000001';
const orderAId = '10000000-0000-4000-8000-000000000002';
const orderBId = '10000000-0000-4000-8000-000000000003';
const itemAId = '10000000-0000-4000-8000-000000000004';
const itemBId = '10000000-0000-4000-8000-000000000005';
const unitId = '10000000-0000-4000-8000-000000000006';
const variantId = '10000000-0000-4000-8000-000000000007';

const actor = {
  id: '10000000-0000-4000-8000-000000000008',
  status: 'ACTIVE',
  employee: { employmentStatus: 'ACTIVE' },
  roleAssignments: [
    {
      branchId,
      branch: { status: 'ACTIVE' },
      role: {
        actorGroup: 'STAFF',
        isActive: true,
        rolePermissions: [
          {
            permission: {
              code: 'rentals.read.branch',
              module: 'rentals',
              action: 'read',
              scope: 'BRANCH',
            },
          },
        ],
      },
    },
  ],
} as unknown as AuthenticatedActor;

function overdueOrder(
  status: OverdueOrderInput['status'] = 'ACTIVE',
  allocationStatus: OverdueOrderInput['items'][number]['allocationStatus'] = 'ACTIVE',
): OverdueOrderInput {
  return {
    id: orderAId,
    status,
    pickupBranchId: branchId,
    plannedStartAt: new Date('2026-10-16T09:00:00.000Z'),
    plannedDueAt: new Date('2026-10-19T09:00:00.000Z'),
    version: 4,
    policyVersion: { lateGraceMinutes: 60, defaultCleaningBufferMinutes: 60 },
    items: [
      {
        id: itemAId,
        variantId,
        unitId,
        allocationStatus,
        variant: { cleaningBufferMinutes: 60 },
      },
    ],
  };
}

function nextOrder() {
  return {
    id: orderBId,
    status: 'CONFIRMED',
    pickupBranchId: branchId,
    plannedStartAt: new Date('2026-10-19T12:30:00.000Z'),
    plannedDueAt: new Date('2026-10-20T12:30:00.000Z'),
    version: 2,
    policyVersion: { lateGraceMinutes: 60, defaultCleaningBufferMinutes: 60 },
    items: [
      {
        id: itemBId,
        variantId,
        unitId,
        allocationStatus: 'CONFIRMED',
        variant: { cleaningBufferMinutes: 60 },
      },
    ],
  };
}

function client(openItems: unknown[] = []) {
  return {
    listOpen: vi.fn().mockResolvedValue({ items: openItems, nextCursor: null }),
    upsert: vi.fn().mockResolvedValue({ caseId: orderAId, state: 'NEW' }),
    resolve: vi.fn().mockResolvedValue({
      caseId: orderAId,
      dedupeKey: 'key',
      outcome: 'RESOLVED',
      sourceObservedAt: observedAt.toISOString(),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(
    (work: (tx: { rentalOrder: typeof mocks }) => Promise<unknown>) =>
      work({
        rentalOrder: {
          findMany: mocks.orderFindMany,
          findUnique: mocks.orderFindUnique,
        },
      } as never),
  );
});

describe('overdue rental detection', () => {
  it('does not report an active rental before its grace deadline', () => {
    const withinGrace = new Date('2026-10-19T09:30:00.000Z');
    expect(buildOverdueReturnRisk(overdueOrder(), withinGrace)).toBeNull();
  });

  it('creates one order-level risk containing only active units', () => {
    const order = overdueOrder();
    order.items.push({
      id: '10000000-0000-4000-8000-000000000009',
      variantId,
      unitId: '10000000-0000-4000-8000-000000000010',
      allocationStatus: 'COMPLETED',
      variant: { cleaningBufferMinutes: 60 },
    });
    const risk = buildOverdueReturnRisk(order, observedAt);
    expect(risk).toMatchObject({
      ruleCode: 'RENTAL_RETURN_OVERDUE',
      primaryEntityId: orderAId,
      affectedEntityId: null,
      unitId: null,
      severity: 'LOW',
    });
    expect(risk?.evidence.activeUnits).toEqual([{ itemId: itemAId, unitId }]);
  });

  it('suppresses Case 4 when the same active unit produces Case 1', async () => {
    mocks.orderFindMany
      .mockResolvedValueOnce([overdueOrder()])
      .mockResolvedValueOnce([nextOrder()])
      .mockResolvedValueOnce([]);
    const agent = client();
    const result = await processOverdueRentalReturns(observedAt, 1440, 100, agent);
    expect(result.candidates).toBe(1);
    expect(result.risks).toBe(0);
    expect(agent.upsert).not.toHaveBeenCalled();
  });

  it('resolves an open finding after all units are returned', async () => {
    const finding = {
      findingId: '10000000-0000-4000-8000-000000000011',
      caseId: '10000000-0000-4000-8000-000000000012',
      branchId,
      ruleCode: 'RENTAL_RETURN_OVERDUE',
      ruleVersion: 'v1',
      dedupeKey: `RENTAL_RETURN_OVERDUE:v1:${orderAId}:2026-10-19T09:00:00.000Z`,
      primaryEntityId: orderAId,
      affectedEntityId: null,
      unitId: null,
      windowStart: '2026-10-16T09:00:00.000Z',
      windowEnd: '2026-10-19T10:00:00.000Z',
      severity: 'MEDIUM',
      status: 'OPEN',
      evidence: {},
      firstDetectedAt: observedAt.toISOString(),
      lastDetectedAt: observedAt.toISOString(),
      sourceObservedAt: observedAt.toISOString(),
    };
    mocks.orderFindMany
      .mockResolvedValueOnce([overdueOrder('RETURN_INSPECTION', 'COMPLETED')])
      .mockResolvedValueOnce([]);
    const agent = client([finding]);
    const result = await processOverdueRentalReturns(observedAt, 1440, 100, agent);
    expect(result.resolved).toBe(1);
    expect(agent.resolve).toHaveBeenCalledOnce();
  });

  it('resolves an open finding after a valid due-date extension', async () => {
    const finding = {
      findingId: '10000000-0000-4000-8000-000000000011',
      caseId: '10000000-0000-4000-8000-000000000012',
      branchId,
      ruleCode: 'RENTAL_RETURN_OVERDUE',
      ruleVersion: 'v1',
      dedupeKey: `RENTAL_RETURN_OVERDUE:v1:${orderAId}:2026-10-19T09:00:00.000Z`,
      primaryEntityId: orderAId,
      affectedEntityId: null,
      unitId: null,
      windowStart: '2026-10-16T09:00:00.000Z',
      windowEnd: '2026-10-19T10:00:00.000Z',
      severity: 'MEDIUM',
      status: 'OPEN',
      evidence: {},
      firstDetectedAt: observedAt.toISOString(),
      lastDetectedAt: observedAt.toISOString(),
      sourceObservedAt: observedAt.toISOString(),
    };
    const extendedOrder = overdueOrder();
    extendedOrder.plannedDueAt = new Date('2026-10-20T09:00:00.000Z');
    mocks.orderFindMany
      .mockResolvedValueOnce([extendedOrder])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const agent = client([finding]);

    const result = await processOverdueRentalReturns(observedAt, 1440, 100, agent);

    expect(result.resolved).toBe(1);
    expect(agent.resolve).toHaveBeenCalledOnce();
    expect(agent.upsert).not.toHaveBeenCalled();
  });

  it('returns a PII-free live context for analysis', async () => {
    mocks.orderFindUnique.mockResolvedValueOnce(overdueOrder());
    mocks.orderFindMany.mockResolvedValueOnce([]);
    const context = await getOverdueRentalContext(actor, { orderId: orderAId });
    expect(context).toMatchObject({
      ruleCode: 'RENTAL_RETURN_OVERDUE',
      riskStillPresent: true,
      downstreamReadinessRisk: false,
      primaryOrder: { id: orderAId, status: 'ACTIVE', version: 4 },
      activeUnits: [{ itemId: itemAId, unitId }],
    });
    expect(JSON.stringify(context)).not.toMatch(/email|phone|customerNote/i);
  });

  it('does not schedule detection when the feature flag is disabled', () => {
    const process = vi.fn();
    const scheduler = startOverdueRentalDetection({ enabled: false, process });
    scheduler.stop();
    expect(process).not.toHaveBeenCalled();
  });
});
