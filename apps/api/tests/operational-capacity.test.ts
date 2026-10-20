import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthenticatedActor } from '../src/modules/auth/authorization.js';

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.WEB_URL = 'http://localhost:3000';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/costume_rental_test';
process.env.AI_SERVICE_URL = 'http://localhost:8001';
process.env.AI_INTERNAL_API_KEY = 'test-ai-internal-key-at-least-32-characters';

const mocks = vi.hoisted(() => ({
  windowFindMany: vi.fn(),
  windowFindUnique: vi.fn(),
  windowFindFirst: vi.fn(),
  blockAggregate: vi.fn(),
  blockFindMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    branchCapacityWindow: {
      findMany: mocks.windowFindMany,
      findUnique: mocks.windowFindUnique,
      findFirst: mocks.windowFindFirst,
    },
    unitBlock: {
      aggregate: mocks.blockAggregate,
      findMany: mocks.blockFindMany,
    },
    $transaction: mocks.transaction,
  },
}));

const {
  buildCapacityShortfallRisk,
  getOperationalCapacityContext,
  processOperationalCapacityShortfalls,
  startOperationalCapacityDetection,
} = await import('../src/modules/scheduling/operational-capacity.service.js');
type CapacityWindowInput = Parameters<typeof buildCapacityShortfallRisk>[0];

const observedAt = new Date('2026-10-19T12:00:00.000Z');
const branchId = '20000000-0000-4000-8000-000000000001';
const windowId = '20000000-0000-4000-8000-000000000002';
const blockId = '20000000-0000-4000-8000-000000000003';
const unitId = '20000000-0000-4000-8000-000000000004';

const actor = {
  id: '20000000-0000-4000-8000-000000000005',
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
              code: 'inventory.read.branch',
              module: 'inventory',
              action: 'read',
              scope: 'BRANCH',
            },
          },
        ],
      },
    },
  ],
} as unknown as AuthenticatedActor;

function window(availableMinutes = 120): CapacityWindowInput {
  return {
    id: windowId,
    branchId,
    startsAt: new Date('2026-10-19T11:00:00.000Z'),
    endsAt: new Date('2026-10-19T16:00:00.000Z'),
    availableMinutes,
    updatedAt: new Date('2026-10-19T10:00:00.000Z'),
  };
}

function block(
  estimatedEffortMinutes: number | null = 180,
  status: 'PLANNED' | 'IN_PROGRESS' = 'PLANNED',
  remainingEffortMinutes: number | null = status === 'IN_PROGRESS' ? estimatedEffortMinutes : null,
) {
  return {
    id: blockId,
    unitId,
    blockType: 'CLEANING',
    status,
    blockedUntil: new Date('2026-10-19T15:00:00.000Z'),
    estimatedEffortMinutes,
    remainingEffortMinutes,
  };
}

function mockWorkload(blocks: ReturnType<typeof block>[]) {
  const planned = blocks.filter((item) => item.status === 'PLANNED');
  const inProgress = blocks.filter((item) => item.status === 'IN_PROGRESS');
  const missing = blocks.filter((item) =>
    item.status === 'IN_PROGRESS'
      ? item.remainingEffortMinutes === null
      : item.estimatedEffortMinutes === null,
  );
  mocks.blockAggregate
    .mockResolvedValueOnce({
      _count: {
        _all: planned.length,
        estimatedEffortMinutes: planned.filter((item) => item.estimatedEffortMinutes !== null)
          .length,
      },
      _sum: {
        estimatedEffortMinutes: planned.reduce(
          (total, item) => total + (item.estimatedEffortMinutes ?? 0),
          0,
        ),
      },
    })
    .mockResolvedValueOnce({
      _count: {
        _all: inProgress.length,
        estimatedEffortMinutes: inProgress.filter((item) => item.estimatedEffortMinutes !== null)
          .length,
        remainingEffortMinutes: inProgress.filter((item) => item.remainingEffortMinutes !== null)
          .length,
      },
      _sum: {
        estimatedEffortMinutes: inProgress.reduce(
          (total, item) => total + (item.estimatedEffortMinutes ?? 0),
          0,
        ),
        remainingEffortMinutes: inProgress.reduce(
          (total, item) => total + (item.remainingEffortMinutes ?? 0),
          0,
        ),
      },
    })
    .mockResolvedValueOnce({
      _sum: {
        remainingEffortMinutes: inProgress
          .filter((item) => item.estimatedEffortMinutes === null)
          .reduce((total, item) => total + (item.remainingEffortMinutes ?? 0), 0),
      },
    });
  mocks.blockFindMany
    .mockResolvedValueOnce(blocks.slice(0, 100))
    .mockResolvedValueOnce(missing.slice(0, 100).map((item) => ({ id: item.id })));
}

function client(openItems: unknown[] = []) {
  return {
    listOpen: vi.fn().mockResolvedValue({ items: openItems, nextCursor: null }),
    upsert: vi.fn().mockResolvedValue({ caseId: windowId, state: 'NEW' }),
    resolve: vi.fn().mockResolvedValue({
      caseId: windowId,
      dedupeKey: 'key',
      outcome: 'RESOLVED',
      sourceObservedAt: observedAt.toISOString(),
    }),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(observedAt);
  vi.clearAllMocks();
  mocks.transaction.mockImplementation((work: (tx: unknown) => Promise<unknown>) =>
    work({
      branchCapacityWindow: {
        findFirst: mocks.windowFindFirst,
        findUnique: mocks.windowFindUnique,
      },
      unitBlock: {
        aggregate: mocks.blockAggregate,
        findMany: mocks.blockFindMany,
      },
    }),
  );
});

afterEach(() => vi.useRealTimers());

describe('operational capacity detection', () => {
  it('creates a branch-level risk from remaining work and prorated active-window capacity', async () => {
    mockWorkload([block()]);
    const risk = await buildCapacityShortfallRisk(window(), observedAt);
    expect(risk).toMatchObject({
      ruleCode: 'OPERATIONAL_CAPACITY_SHORTFALL',
      branchId,
      primaryEntityId: branchId,
      affectedEntityId: null,
      unitId: null,
      severity: 'HIGH',
      evidence: {
        requiredMinutes: 180,
        remainingRequiredMinutes: 180,
        availableMinutes: 120,
        remainingAvailableMinutes: 96,
        capacityGapMinutes: 84,
      },
    });
    const query = mocks.blockFindMany.mock.calls[0]?.[0] as {
      where?: { capacityWindowId?: string };
    };
    expect(query.where?.capacityWindowId).toBe(windowId);
    expect((query.where as { status?: unknown }).status).toEqual({
      in: ['PLANNED', 'IN_PROGRESS'],
    });
  });

  it('does not infer a shortfall when any relevant task lacks an effort estimate', async () => {
    mockWorkload([block(null)]);
    await expect(buildCapacityShortfallRisk(window(), observedAt)).resolves.toBeNull();
  });

  it('uses the authoritative missing-effort count even when detail rows race empty', async () => {
    mocks.blockAggregate.mockResolvedValueOnce({
      _count: { _all: 1, estimatedEffortMinutes: 0 },
      _sum: { estimatedEffortMinutes: 180 },
    });
    mocks.blockAggregate.mockResolvedValueOnce({
      _count: { _all: 0, estimatedEffortMinutes: 0, remainingEffortMinutes: 0 },
      _sum: { estimatedEffortMinutes: null, remainingEffortMinutes: null },
    });
    mocks.blockAggregate.mockResolvedValueOnce({
      _sum: { remainingEffortMinutes: null },
    });
    mocks.blockFindMany.mockResolvedValueOnce([block(180)]).mockResolvedValueOnce([]);

    await expect(buildCapacityShortfallRisk(window(), observedAt)).resolves.toBeNull();
  });

  it('caps workload details while keeping the exact workload total', async () => {
    const blocks = Array.from({ length: 101 }, (_, index) => ({
      ...block(2),
      id: `block-${index}`,
    }));
    mockWorkload(blocks);

    const risk = await buildCapacityShortfallRisk(window(100), observedAt);

    expect(risk?.evidence).toMatchObject({
      requiredMinutes: 202,
      workloadCount: 101,
      workloadTruncated: true,
    });
    expect((risk?.evidence.workload as unknown[]).length).toBe(100);
  });

  it('does not create a risk at or below capacity', async () => {
    mockWorkload([block(96)]);
    await expect(buildCapacityShortfallRisk(window(), observedAt)).resolves.toBeNull();
  });

  it('uses remaining effort instead of the original estimate for in-progress work', async () => {
    mockWorkload([block(180, 'IN_PROGRESS', 30)]);

    await expect(buildCapacityShortfallRisk(window(), observedAt)).resolves.toBeNull();
  });

  it('reports original and remaining effort separately for in-progress work', async () => {
    mockWorkload([block(180, 'IN_PROGRESS', 120)]);

    const risk = await buildCapacityShortfallRisk(window(), observedAt);

    expect(risk?.evidence).toMatchObject({
      requiredMinutes: 180,
      remainingRequiredMinutes: 120,
      remainingAvailableMinutes: 96,
      capacityGapMinutes: 24,
    });
  });

  it('falls back per task when an in-progress block has no original estimate', async () => {
    mockWorkload([
      { ...block(100, 'IN_PROGRESS', 30), id: 'block-with-estimate' },
      { ...block(null, 'IN_PROGRESS', 20), id: 'block-without-estimate' },
    ]);

    const risk = await buildCapacityShortfallRisk(window(40), observedAt);

    expect(risk?.evidence).toMatchObject({
      requiredMinutes: 120,
      remainingRequiredMinutes: 50,
      remainingAvailableMinutes: 32,
      capacityGapMinutes: 18,
    });
  });

  it('does not infer a shortfall when in-progress work has no remaining estimate', async () => {
    mockWorkload([block(180, 'IN_PROGRESS', null)]);

    await expect(buildCapacityShortfallRisk(window(), observedAt)).resolves.toBeNull();
  });

  it('uses full capacity before a future window starts', async () => {
    const future = {
      ...window(),
      startsAt: new Date('2026-10-19T13:00:00.000Z'),
      endsAt: new Date('2026-10-19T17:00:00.000Z'),
    };
    mockWorkload([block(121)]);

    const risk = await buildCapacityShortfallRisk(future, observedAt);

    expect(risk?.evidence).toMatchObject({
      remainingAvailableMinutes: 120,
      capacityGapMinutes: 1,
    });
  });

  it('does not keep a capacity finding after the window expires', async () => {
    await expect(
      buildCapacityShortfallRisk(window(), new Date('2026-10-19T16:00:00.000Z')),
    ).resolves.toBeNull();
    expect(mocks.blockAggregate).not.toHaveBeenCalled();
  });

  it('resolves an open finding after capacity becomes sufficient', async () => {
    const finding = {
      findingId: '20000000-0000-4000-8000-000000000006',
      caseId: '20000000-0000-4000-8000-000000000007',
      branchId,
      ruleCode: 'OPERATIONAL_CAPACITY_SHORTFALL',
      ruleVersion: 'v1',
      dedupeKey: 'capacity-key',
      primaryEntityId: branchId,
      affectedEntityId: null,
      unitId: null,
      windowStart: window().startsAt.toISOString(),
      windowEnd: window().endsAt.toISOString(),
      severity: 'HIGH',
      status: 'OPEN',
      evidence: { capacityWindowId: windowId },
      firstDetectedAt: observedAt.toISOString(),
      lastDetectedAt: observedAt.toISOString(),
      sourceObservedAt: observedAt.toISOString(),
    };
    mocks.windowFindUnique.mockResolvedValueOnce(window(240));
    mockWorkload([block(180)]);
    mocks.windowFindMany.mockResolvedValueOnce([]);
    const agent = client([finding]);

    const result = await processOperationalCapacityShortfalls(observedAt, 1440, 100, agent);

    expect(result.resolved).toBe(1);
    expect(agent.resolve).toHaveBeenCalledOnce();
    expect(agent.upsert).not.toHaveBeenCalled();
  });

  it('returns a PII-free live context', async () => {
    mocks.windowFindFirst.mockResolvedValueOnce(window());
    mockWorkload([block()]);
    const context = await getOperationalCapacityContext(actor, {
      branchId,
      startsAt: window().startsAt,
      endsAt: window().endsAt,
    });
    expect(context).toMatchObject({
      ruleCode: 'OPERATIONAL_CAPACITY_SHORTFALL',
      riskStillPresent: true,
      branchId,
      requiredMinutes: 180,
      remainingRequiredMinutes: 180,
      capacityGapMinutes: 84,
      completeData: true,
      capacityWindow: { availableMinutes: 120, remainingAvailableMinutes: 96 },
    });
    expect(JSON.stringify(context)).not.toMatch(/email|phone|displayName|employee/i);
  });

  it('does not schedule detection when the feature flag is disabled', () => {
    const process = vi.fn();
    const scheduler = startOperationalCapacityDetection({ enabled: false, process });
    scheduler.stop();
    expect(process).not.toHaveBeenCalled();
  });
});
