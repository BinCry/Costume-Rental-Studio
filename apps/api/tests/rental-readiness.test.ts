import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentFindingUpsertInput } from '../src/modules/agent/agent-internal.service.js';
import type { AuthenticatedActor } from '../src/modules/auth/authorization.js';
import * as rentalService from '../src/modules/rentals/rental.service.js';

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
  itemFindMany: vi.fn(),
  unitFindMany: vi.fn(),
  unitFindUnique: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    rentalOrder: { findMany: mocks.orderFindMany, findUnique: mocks.orderFindUnique },
    rentalOrderItem: { findMany: mocks.itemFindMany },
    costumeUnit: { findMany: mocks.unitFindMany, findUnique: mocks.unitFindUnique },
    $transaction: mocks.transaction,
  },
}));

const { getRentalReadinessContext, processRentalReadiness, startRentalReadinessDetection } =
  await import('../src/modules/rentals/rental-readiness.service.js');
const checkAvailability = vi.spyOn(rentalService, 'checkAvailability');
const {
  listOpenRentalReadinessFindings,
  resolveRentalReadinessFinding,
  upsertRentalReadinessFinding,
} = await import('../src/modules/agent/agent-internal.service.js');

const observedAt = new Date('2026-10-17T10:00:00.000Z');
const branchId = '10000000-0000-4000-8000-000000000001';
const orderAId = '10000000-0000-4000-8000-000000000002';
const orderBId = '10000000-0000-4000-8000-000000000003';
const itemAId = '10000000-0000-4000-8000-000000000004';
const itemBId = '10000000-0000-4000-8000-000000000005';
const unitId = '10000000-0000-4000-8000-000000000006';
const variantId = '10000000-0000-4000-8000-000000000007';
const replacementUnitId = '10000000-0000-4000-8000-000000000008';
const actor = {
  id: '10000000-0000-4000-8000-000000000009',
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

function unit(
  operationalStatus = 'READY',
  blocks: {
    id: string;
    blockType: string;
    status: string;
    blockedFrom: Date;
    blockedUntil: Date;
  }[] = [],
) {
  return {
    id: unitId,
    unitCode: 'UNIT-001',
    variantId,
    currentBranchId: branchId,
    operationalStatus,
    conditionGrade: 'GOOD',
    blocks,
    transferItems: [],
  };
}

function orderB(start = '2026-10-17T11:00:00.000Z', cleaningBufferMinutes: number | null = 120) {
  return {
    id: orderBId,
    version: 7,
    status: 'CONFIRMED',
    pickupBranchId: branchId,
    plannedStartAt: new Date(start),
    plannedDueAt: new Date('2026-10-18T11:00:00.000Z'),
    policyVersion: { defaultCleaningBufferMinutes: 60 },
    items: [
      {
        id: itemBId,
        variantId,
        unitId,
        allocationStatus: 'CONFIRMED',
        variant: { cleaningBufferMinutes },
      },
    ],
  };
}

function orderA(allocationStatus = 'ACTIVE') {
  return {
    id: orderAId,
    status: 'ACTIVE',
    pickupBranchId: branchId,
    plannedStartAt: new Date('2026-10-15T10:00:00.000Z'),
    plannedDueAt: new Date('2026-10-17T09:00:00.000Z'),
    policyVersion: { defaultCleaningBufferMinutes: 60 },
    items: [
      {
        id: itemAId,
        unitId,
        allocationStatus,
        variant: { cleaningBufferMinutes: 120 },
      },
    ],
  };
}

function client(
  openItems: unknown[] = [],
  unitOpenItems: unknown[] = [],
  preparationOpenItems: unknown[] = [],
) {
  return {
    listOpen: vi.fn().mockImplementation((ruleCode: string) =>
      Promise.resolve({
        items:
          ruleCode === 'ALLOCATED_UNIT_NOT_READY'
            ? unitOpenItems
            : ruleCode === 'ORDER_PREPARATION_DELAYED'
              ? preparationOpenItems
              : openItems,
        nextCursor: null,
      }),
    ),
    upsert: vi.fn().mockResolvedValue({ caseId: orderBId, state: 'NEW' }),
    resolve: vi.fn().mockResolvedValue({
      caseId: orderBId,
      dedupeKey: 'key',
      outcome: 'RESOLVED',
      sourceObservedAt: observedAt.toISOString(),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.itemFindMany.mockResolvedValue([]);
  mocks.unitFindMany.mockResolvedValue([unit()]);
  mocks.transaction.mockImplementation((input: unknown) => {
    if (Array.isArray(input)) return Promise.all(input);
    if (typeof input === 'function') {
      const transaction = input as (tx: {
        rentalOrder: { findUnique: typeof mocks.orderFindUnique };
        rentalOrderItem: { findMany: typeof mocks.itemFindMany };
        costumeUnit: { findMany: typeof mocks.unitFindMany };
      }) => Promise<unknown>;
      return transaction({
        rentalOrder: { findUnique: mocks.orderFindUnique },
        rentalOrderItem: { findMany: mocks.itemFindMany },
        costumeUnit: { findMany: mocks.unitFindMany },
      });
    }
    throw new Error('Unexpected transaction input');
  });
  checkAvailability.mockReset().mockResolvedValue({ available: false, units: [] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('rental readiness detection', () => {
  it('returns an order-level preparation context without customer PII or a unit identity', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(observedAt);
    mocks.orderFindUnique.mockResolvedValueOnce(orderB());
    mocks.unitFindMany.mockResolvedValueOnce([unit('READY')]);
    mocks.itemFindMany.mockResolvedValueOnce([]);

    const context = await getRentalReadinessContext(actor, {
      ruleCode: 'ORDER_PREPARATION_DELAYED',
      primaryOrderId: orderBId,
    });

    expect(context).toMatchObject({
      ruleCode: 'ORDER_PREPARATION_DELAYED',
      riskStillPresent: true,
      affectedOrder: null,
      currentUnit: null,
      primaryOrder: { id: orderBId, status: 'CONFIRMED', version: 7 },
      reasonCodes: ['ORDER_NOT_READY_FOR_PICKUP'],
      allocatedUnits: [{ id: unitId, operationalStatus: 'READY' }],
    });
    expect(context.primaryOrder).not.toHaveProperty('customer');
  });

  it('returns the Case 2 live context without requiring an affected order', async () => {
    mocks.orderFindUnique.mockResolvedValueOnce(orderB());
    mocks.unitFindUnique.mockResolvedValueOnce(unit('CLEANING'));
    checkAvailability.mockResolvedValueOnce({
      available: true,
      units: [
        { id: unitId, unitCode: 'UNIT-001', conditionGrade: 'GOOD' },
        { id: replacementUnitId, unitCode: 'UNIT-002', conditionGrade: 'GOOD' },
      ],
    });

    const context = await getRentalReadinessContext(actor, {
      ruleCode: 'ALLOCATED_UNIT_NOT_READY',
      primaryOrderId: orderBId,
      unitId,
    });

    expect(context).toMatchObject({
      ruleCode: 'ALLOCATED_UNIT_NOT_READY',
      riskStillPresent: true,
      affectedOrder: null,
      primaryOrder: {
        id: orderBId,
        version: 7,
        item: { id: itemBId, variantId, unitId },
      },
      currentUnit: { id: unitId, operationalStatus: 'CLEANING' },
      reasonCodes: ['STATUS_NOT_READY'],
      replacementUnits: [{ id: replacementUnitId, unitCode: 'UNIT-002', conditionGrade: 'GOOD' }],
    });
  });

  it('does not create a finding when the preparation buffer still fits', async () => {
    const next = orderB('2026-10-17T13:00:00.000Z', 60);
    mocks.orderFindMany.mockResolvedValueOnce([next]);
    mocks.itemFindMany.mockResolvedValueOnce([{ unitId, order: orderA() }]);
    const agent = client();

    await expect(processRentalReadiness(observedAt, 1440, 100, agent)).resolves.toMatchObject({
      candidates: 1,
      risks: 0,
      upserted: 0,
    });
    expect(agent.upsert).not.toHaveBeenCalled();
  });

  it('upserts one deterministic finding when the previous rental is still active', async () => {
    mocks.orderFindMany.mockResolvedValueOnce([orderB()]);
    mocks.itemFindMany.mockResolvedValueOnce([{ unitId, order: orderA() }]);
    const agent = client();

    await expect(processRentalReadiness(observedAt, 1440, 100, agent)).resolves.toMatchObject({
      candidates: 1,
      risks: 1,
      upserted: 1,
    });
    expect(agent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleCode: 'PREVIOUS_RENTAL_NOT_RETURNED',
        ruleVersion: 'v1',
        dedupeKey: `PREVIOUS_RENTAL_NOT_RETURNED:v1:${orderBId}:${orderAId}:${unitId}:2026-10-17T11:00:00.000Z`,
        branchId,
        primaryEntityId: orderBId,
        affectedEntityId: orderAId,
        unitId,
        severity: 'HIGH',
        deadlineAt: '2026-10-17T11:00:00.000Z',
        observedAt: observedAt.toISOString(),
      }),
    );
  });

  it('uses the policy buffer when the variant does not override it', async () => {
    mocks.orderFindMany.mockResolvedValueOnce([orderB('2026-10-17T10:30:00.000Z', null)]);
    mocks.itemFindMany.mockResolvedValueOnce([{ unitId, order: orderA() }]);
    const agent = client();

    await processRentalReadiness(observedAt, 1440, 100, agent);

    const [upsertInput] = agent.upsert.mock.calls[0] as [AgentFindingUpsertInput];
    expect(upsertInput.evidence).toMatchObject({ cleaningBufferMinutes: 60 });
  });

  it('creates a finding when the allocated unit has no path to READY before pickup', async () => {
    mocks.orderFindMany.mockResolvedValueOnce([orderB()]);
    mocks.itemFindMany.mockResolvedValueOnce([]);
    mocks.unitFindMany.mockResolvedValueOnce([unit('CLEANING')]);
    const agent = client();

    await expect(processRentalReadiness(observedAt, 1440, 100, agent)).resolves.toMatchObject({
      candidates: 1,
      risks: 1,
      upserted: 1,
    });
    expect(agent.upsert).toHaveBeenCalledTimes(1);
    const [upsertInput] = agent.upsert.mock.calls[0] as [AgentFindingUpsertInput];
    expect(upsertInput).toMatchObject({
      ruleCode: 'ALLOCATED_UNIT_NOT_READY',
      ruleVersion: 'v1',
      dedupeKey: `ALLOCATED_UNIT_NOT_READY:v1:${orderBId}:${unitId}:2026-10-17T11:00:00.000Z`,
      primaryEntityId: orderBId,
      affectedEntityId: unitId,
      unitId,
      severity: 'HIGH',
      evidence: {
        affectedEntityType: 'COSTUME_UNIT',
        unitOperationalStatus: 'CLEANING',
        reasonCodes: ['STATUS_NOT_READY'],
      },
    });
  });

  it('creates one order-level preparation-delay finding only when every unit is ready', async () => {
    mocks.orderFindMany.mockResolvedValueOnce([orderB()]);
    mocks.itemFindMany.mockResolvedValueOnce([]);
    mocks.unitFindMany.mockResolvedValueOnce([unit('READY')]);
    const agent = client();

    await expect(processRentalReadiness(observedAt, 1440, 100, agent)).resolves.toMatchObject({
      candidates: 1,
      risks: 1,
      upserted: 1,
    });
    const [preparationInput] = agent.upsert.mock.calls[0] as [AgentFindingUpsertInput];
    expect(preparationInput).toMatchObject({
      ruleCode: 'ORDER_PREPARATION_DELAYED',
      dedupeKey: `ORDER_PREPARATION_DELAYED:v1:${orderBId}:2026-10-17T11:00:00.000Z`,
      primaryEntityId: orderBId,
      affectedEntityId: null,
      unitId: null,
      evidence: {
        orderBStatus: 'CONFIRMED',
        reasonCodes: ['ORDER_NOT_READY_FOR_PICKUP'],
      },
    });
  });

  it('does not create Case 3 when Case 1 owns the previous-rental risk', async () => {
    mocks.orderFindMany.mockResolvedValueOnce([orderB()]);
    mocks.itemFindMany.mockResolvedValueOnce([{ unitId, order: orderA() }]);
    mocks.unitFindMany.mockResolvedValueOnce([unit('READY')]);
    const agent = client();

    await processRentalReadiness(observedAt, 1440, 100, agent);

    const rules = agent.upsert.mock.calls.map(
      ([input]) => (input as AgentFindingUpsertInput).ruleCode,
    );
    expect(rules).toContain('PREVIOUS_RENTAL_NOT_RETURNED');
    expect(rules).not.toContain('ORDER_PREPARATION_DELAYED');
  });

  it('does not create Case 3 when Case 2 owns a unit-readiness risk', async () => {
    mocks.orderFindMany.mockResolvedValueOnce([orderB()]);
    mocks.itemFindMany.mockResolvedValueOnce([]);
    mocks.unitFindMany.mockResolvedValueOnce([unit('REPAIR')]);
    const agent = client();

    await processRentalReadiness(observedAt, 1440, 100, agent);

    const rules = agent.upsert.mock.calls.map(
      ([input]) => (input as AgentFindingUpsertInput).ruleCode,
    );
    expect(rules).toContain('ALLOCATED_UNIT_NOT_READY');
    expect(rules).not.toContain('ORDER_PREPARATION_DELAYED');
  });

  it('does not create a unit-readiness finding when scheduled cleaning ends before pickup', async () => {
    mocks.orderFindMany.mockResolvedValueOnce([orderB()]);
    mocks.itemFindMany.mockResolvedValueOnce([]);
    mocks.unitFindMany.mockResolvedValueOnce([
      unit('CLEANING', [
        {
          id: '10000000-0000-4000-8000-000000000020',
          blockType: 'CLEANING',
          status: 'IN_PROGRESS',
          blockedFrom: new Date('2026-10-17T09:30:00.000Z'),
          blockedUntil: new Date('2026-10-17T10:30:00.000Z'),
        },
      ]),
    ]);
    const agent = client();

    await expect(processRentalReadiness(observedAt, 1440, 100, agent)).resolves.toMatchObject({
      risks: 0,
      upserted: 0,
    });
  });

  it('resolves a unit-readiness finding after the allocated unit becomes READY', async () => {
    const finding = {
      findingId: itemAId,
      caseId: itemBId,
      branchId,
      ruleCode: 'ALLOCATED_UNIT_NOT_READY',
      ruleVersion: 'v1',
      dedupeKey: `ALLOCATED_UNIT_NOT_READY:v1:${orderBId}:${unitId}:2026-10-17T11:00:00.000Z`,
      primaryEntityId: orderBId,
      affectedEntityId: unitId,
      unitId,
      windowStart: '2026-10-16T11:00:00.000Z',
      windowEnd: '2026-10-17T11:00:00.000Z',
      severity: 'HIGH',
      status: 'OPEN',
      evidence: {},
      firstDetectedAt: observedAt.toISOString(),
      lastDetectedAt: observedAt.toISOString(),
      sourceObservedAt: observedAt.toISOString(),
      resolvedAt: null,
    };
    const agent = client([], [finding]);
    mocks.orderFindMany.mockResolvedValueOnce([orderB()]).mockResolvedValueOnce([]);
    mocks.unitFindMany.mockResolvedValueOnce([unit('READY')]);

    await expect(processRentalReadiness(observedAt, 1440, 100, agent)).resolves.toMatchObject({
      resolved: 1,
    });
    expect(agent.resolve).toHaveBeenCalledWith(
      'ALLOCATED_UNIT_NOT_READY',
      finding.dedupeKey,
      observedAt,
      expect.objectContaining({ reason: 'RISK_NO_LONGER_PRESENT' }),
    );
  });

  it('resolves Case 3 when an active previous rental takes precedence', async () => {
    const finding = {
      findingId: itemAId,
      caseId: itemBId,
      branchId,
      ruleCode: 'ORDER_PREPARATION_DELAYED',
      ruleVersion: 'v1',
      dedupeKey: `ORDER_PREPARATION_DELAYED:v1:${orderBId}:2026-10-17T11:00:00.000Z`,
      primaryEntityId: orderBId,
      affectedEntityId: null,
      unitId: null,
      windowStart: '2026-10-17T09:00:00.000Z',
      windowEnd: '2026-10-17T11:00:00.000Z',
      severity: 'HIGH',
      status: 'OPEN',
      evidence: {},
      firstDetectedAt: observedAt.toISOString(),
      lastDetectedAt: observedAt.toISOString(),
      sourceObservedAt: observedAt.toISOString(),
      resolvedAt: null,
    };
    const agent = client([], [], [finding]);
    mocks.orderFindMany.mockResolvedValueOnce([orderB()]).mockResolvedValueOnce([]);
    mocks.unitFindMany.mockResolvedValueOnce([unit('READY')]);
    mocks.itemFindMany.mockResolvedValueOnce([{ unitId }]);

    await expect(processRentalReadiness(observedAt, 1440, 100, agent)).resolves.toMatchObject({
      resolved: 1,
    });
    expect(agent.resolve).toHaveBeenCalledWith(
      'ORDER_PREPARATION_DELAYED',
      finding.dedupeKey,
      observedAt,
      expect.objectContaining({ reason: 'RISK_NO_LONGER_PRESENT' }),
    );
  });

  it('resolves an open finding even when its next order is no longer a candidate', async () => {
    const finding = {
      findingId: itemAId,
      caseId: itemBId,
      branchId,
      ruleCode: 'PREVIOUS_RENTAL_NOT_RETURNED',
      ruleVersion: 'v1',
      dedupeKey: 'old-key',
      primaryEntityId: orderBId,
      affectedEntityId: orderAId,
      unitId,
      windowStart: '2026-10-16T11:00:00.000Z',
      windowEnd: '2026-10-17T11:00:00.000Z',
      severity: 'HIGH',
      status: 'OPEN',
      evidence: {},
      firstDetectedAt: observedAt.toISOString(),
      lastDetectedAt: observedAt.toISOString(),
      sourceObservedAt: observedAt.toISOString(),
      resolvedAt: null,
    };
    const agent = client([finding]);
    mocks.orderFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await expect(processRentalReadiness(observedAt, 1440, 100, agent)).resolves.toMatchObject({
      resolved: 1,
    });
    expect(agent.resolve).toHaveBeenCalledWith(
      'PREVIOUS_RENTAL_NOT_RETURNED',
      'old-key',
      observedAt,
      expect.objectContaining({ reason: 'RISK_NO_LONGER_PRESENT' }),
    );
  });

  it('resolves only the finding whose unit allocation was completed', async () => {
    const finding = {
      findingId: itemAId,
      caseId: itemBId,
      branchId,
      ruleCode: 'PREVIOUS_RENTAL_NOT_RETURNED',
      ruleVersion: 'v1',
      dedupeKey: 'old-key',
      primaryEntityId: orderBId,
      affectedEntityId: orderAId,
      unitId,
      windowStart: '2026-10-16T11:00:00.000Z',
      windowEnd: '2026-10-17T11:00:00.000Z',
      severity: 'HIGH',
      status: 'OPEN',
      evidence: {},
      firstDetectedAt: observedAt.toISOString(),
      lastDetectedAt: observedAt.toISOString(),
      sourceObservedAt: observedAt.toISOString(),
      resolvedAt: null,
    };
    const agent = client([finding]);
    mocks.orderFindMany
      .mockResolvedValueOnce([orderB(), orderA('COMPLETED')])
      .mockResolvedValueOnce([orderB()]);
    mocks.itemFindMany.mockResolvedValueOnce([]);

    await processRentalReadiness(observedAt, 1440, 100, agent);

    expect(agent.resolve).toHaveBeenCalledTimes(1);
    expect(agent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ ruleCode: 'ORDER_PREPARATION_DELAYED' }),
    );
    expect(agent.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({ ruleCode: 'PREVIOUS_RENTAL_NOT_RETURNED' }),
    );
  });

  it('does not overlap scheduler ticks in one process', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const process = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<typeof processRentalReadiness>>>((resolve) => {
          finish = () =>
            resolve({
              candidates: 0,
              risks: 0,
              upserted: 0,
              resolved: 0,
              staleObservations: 0,
              failedCalls: 0,
              nextFindingCursors: {},
            });
        }),
    );
    const scheduler = startRentalReadinessDetection({
      enabled: true,
      intervalMilliseconds: 1000,
      process,
    });
    await vi.advanceTimersByTimeAsync(3000);
    expect(process).toHaveBeenCalledTimes(1);
    finish();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1000);
    expect(process).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('does not schedule work while the feature is disabled', async () => {
    vi.useFakeTimers();
    const process = vi.fn();
    const scheduler = startRentalReadinessDetection({ enabled: false, process });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(process).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it('keyset-paginates every candidate, including equal pickup timestamps', async () => {
    const sameStart = '2026-10-17T11:00:00.000Z';
    const first = { ...orderB(sameStart, 0), id: '10000000-0000-4000-8000-000000000010' };
    const second = { ...orderB(sameStart, 0), id: '10000000-0000-4000-8000-000000000011' };
    const third = { ...orderB(sameStart, 0), id: '10000000-0000-4000-8000-000000000012' };
    mocks.orderFindMany.mockResolvedValueOnce([first, second]).mockResolvedValueOnce([third]);
    mocks.itemFindMany.mockResolvedValue([]);
    const agent = client();

    await expect(processRentalReadiness(observedAt, 1440, 2, agent)).resolves.toMatchObject({
      candidates: 3,
    });

    expect(mocks.orderFindMany).toHaveBeenCalledTimes(2);
    expect(mocks.orderFindMany.mock.calls[1]![0]).toMatchObject({
      where: {
        OR: [
          { plannedStartAt: { gt: new Date(sameStart) } },
          {
            plannedStartAt: new Date(sameStart),
            id: { gt: second.id },
          },
        ],
      },
      orderBy: [{ plannedStartAt: 'asc' }, { id: 'asc' }],
      take: 2,
    });
  });

  it('processes one bounded finding page and exposes its cursor for the next tick', async () => {
    const agent = client();
    agent.listOpen.mockImplementation((ruleCode: string, cursor?: string) =>
      Promise.resolve({
        items: [],
        nextCursor:
          ruleCode === 'PREVIOUS_RENTAL_NOT_RETURNED' && cursor === undefined
            ? 'finding-page-2'
            : null,
      }),
    );
    mocks.orderFindMany.mockResolvedValue([]);

    const first = await processRentalReadiness(observedAt, 1440, 2, agent);
    const second = await processRentalReadiness(
      observedAt,
      1440,
      2,
      agent,
      first.nextFindingCursors,
    );

    expect(first.nextFindingCursors).toEqual({
      PREVIOUS_RENTAL_NOT_RETURNED: 'finding-page-2',
    });
    expect(second.nextFindingCursors).toEqual({});
    expect(agent.listOpen).toHaveBeenNthCalledWith(1, 'PREVIOUS_RENTAL_NOT_RETURNED', undefined, 2);
    expect(agent.listOpen).toHaveBeenNthCalledWith(
      4,
      'PREVIOUS_RENTAL_NOT_RETURNED',
      'finding-page-2',
      2,
    );
  });
});

describe('internal readiness agent client', () => {
  it('sends only service authentication headers and validates list data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { items: [], nextCursor: null } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(listOpenRentalReadinessFindings(undefined, 50)).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe('/api/v1/agent/internal/findings');
    expect(url.searchParams.get('limit')).toBe('50');
    const headers = new Headers(init.headers);
    expect(headers.get('X-AI-Service-Key')).toBe(process.env.AI_INTERNAL_API_KEY);
    expect(headers.get('X-Actor-Id')).toBeNull();
    expect(headers.get('X-Agent-Read-All')).toBeNull();
  });

  it('rejects malformed AI responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ success: true, data: { items: 'invalid' } }), {
            status: 200,
          }),
        ),
    );

    await expect(listOpenRentalReadinessFindings()).rejects.toMatchObject({
      code: 'AI_SERVICE_INVALID_RESPONSE',
    });
  });

  it('accepts FastAPI datetime responses with an explicit timezone offset', async () => {
    const offsetTimestamp = '2026-10-17T17:00:00+07:00';
    const finding = {
      findingId: itemAId,
      caseId: itemBId,
      branchId,
      ruleCode: 'PREVIOUS_RENTAL_NOT_RETURNED',
      ruleVersion: 'v1',
      dedupeKey: 'offset-key',
      primaryEntityId: orderBId,
      affectedEntityId: orderAId,
      unitId,
      windowStart: offsetTimestamp,
      windowEnd: offsetTimestamp,
      severity: 'HIGH',
      status: 'OPEN',
      evidence: {},
      firstDetectedAt: offsetTimestamp,
      lastDetectedAt: offsetTimestamp,
      sourceObservedAt: offsetTimestamp,
      resolvedAt: null,
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ success: true, data: { items: [finding], nextCursor: null } }),
            { status: 200 },
          ),
        ),
    );

    await expect(listOpenRentalReadinessFindings()).resolves.toEqual({
      items: [finding],
      nextCursor: null,
    });
  });

  it('rejects an AI response whose declared body exceeds the response limit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{}', {
          status: 200,
          headers: { 'Content-Length': '1000001' },
        }),
      ),
    );

    await expect(listOpenRentalReadinessFindings()).rejects.toMatchObject({
      code: 'AI_SERVICE_INVALID_RESPONSE',
    });
  });

  it('serializes upsert and resolve observation timestamps', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { caseId: orderBId, state: 'NEW' } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              caseId: orderBId,
              dedupeKey: 'key',
              outcome: 'RESOLVED',
              sourceObservedAt: observedAt.toISOString(),
            },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await upsertRentalReadinessFinding({
      ruleCode: 'PREVIOUS_RENTAL_NOT_RETURNED',
      ruleVersion: 'v1',
      dedupeKey: 'key',
      branchId,
      primaryEntityId: orderBId,
      affectedEntityId: orderAId,
      unitId,
      windowStart: '2026-10-16T11:00:00.000Z',
      windowEnd: '2026-10-17T11:00:00.000Z',
      severity: 'HIGH',
      deadlineAt: '2026-10-17T11:00:00.000Z',
      evidence: {},
      observedAt: observedAt.toISOString(),
    });
    await resolveRentalReadinessFinding('key', observedAt, {});

    const [, upsertInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const [, resolveInit] = fetchMock.mock.calls[1] as [URL, RequestInit];
    const upsertBody = JSON.parse(upsertInit.body as string) as Record<string, unknown>;
    const resolveBody = JSON.parse(resolveInit.body as string) as Record<string, unknown>;
    expect(upsertBody.observedAt).toBe(observedAt.toISOString());
    expect(resolveBody).toMatchObject({
      ruleCode: 'PREVIOUS_RENTAL_NOT_RETURNED',
      resolutionCode: 'RISK_NO_LONGER_PRESENT',
      observedAt: observedAt.toISOString(),
    });
  });
});
