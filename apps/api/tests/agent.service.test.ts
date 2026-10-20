import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthenticatedActor } from '../src/modules/auth/authorization.js';

const branchFindUnique = vi.hoisted(() => vi.fn());
const rentalOrderFindMany = vi.hoisted(() => vi.fn());
const costumeUnitFindMany = vi.hoisted(() => vi.fn());
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    branch: { findUnique: branchFindUnique },
    rentalOrder: { findMany: rentalOrderFindMany },
    costumeUnit: { findMany: costumeUnitFindMany },
  },
}));
process.env.AGENT_READINESS_ANALYSIS_ENABLED = 'true';
process.env.AGENT_CRM_WRITE_ENABLED = 'true';

const {
  approveAgentAction,
  analyzeAgentCase,
  cancelAgentCase,
  claimAgentCase,
  confirmAgentCase,
  getAgentCase,
  listAgentCases,
  prepareOverdueFollowUpConfirmation,
  rejectAgentAction,
  rejectAgentCaseConfirmation,
  releaseAgentCase,
  sendAgentMessage,
} = await import('../src/modules/agent/agent.service.js');

const caseId = '10000000-0000-4000-8000-000000000002';
const confirmationId = '10000000-0000-4000-8000-000000000003';
const approvalId = '10000000-0000-4000-8000-000000000004';
const branchId = '10000000-0000-4000-8000-000000000005';
const primaryOrderId = '20000000-0000-4000-8000-000000000001';
const affectedOrderId = '20000000-0000-4000-8000-000000000002';
const unitId = '20000000-0000-4000-8000-000000000003';
const actor = {
  id: '10000000-0000-4000-8000-000000000001',
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
              code: 'knowledge.read.branch',
              module: 'knowledge',
              action: 'read',
              scope: 'BRANCH',
            },
          },
        ],
      },
    },
  ],
} as unknown as AuthenticatedActor;

const branchActor = {
  id: '10000000-0000-4000-8000-000000000006',
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
              code: 'agents.read.branch',
              module: 'agents',
              action: 'read',
              scope: 'BRANCH',
            },
          },
          {
            permission: {
              code: 'agents.manage.branch',
              module: 'agents',
              action: 'manage',
              scope: 'BRANCH',
            },
          },
        ],
      },
    },
  ],
} as unknown as AuthenticatedActor;

const adminActor = {
  id: '10000000-0000-4000-8000-000000000007',
  status: 'ACTIVE',
  employee: { employmentStatus: 'ACTIVE' },
  roleAssignments: [
    {
      branchId: null,
      branch: null,
      role: {
        actorGroup: 'STAFF',
        isActive: true,
        rolePermissions: [
          {
            permission: {
              code: 'agents.read.all',
              module: 'agents',
              action: 'read',
              scope: 'ALL',
            },
          },
          {
            permission: {
              code: 'agents.manage.all',
              module: 'agents',
              action: 'manage',
              scope: 'ALL',
            },
          },
        ],
      },
    },
  ],
} as unknown as AuthenticatedActor;

const result = {
  caseId,
  state: 'INSUFFICIENT_DATA',
  ownership: 'UNCLAIMED',
  message: 'Please provide more information.',
  evidence: [],
  goal: { summary: 'Rental assistance', status: 'WAITING_FOR_INPUT' },
  pendingInput: null,
  pendingConfirmation: null,
  pendingApproval: null,
  handoff: { nextAction: 'Ask for the order code.', sideEffects: 'No changes were made.' },
  completed: true,
};
const upstreamResult = {
  ...result,
  runStatus: 'COMPLETED',
  stepsUsed: 3,
  tokensUsed: 120,
  terminationReason: 'INTERNAL_TERMINATION_REASON',
  goal: {
    ...result.goal,
    goalType: 'INTERNAL_GOAL_TYPE',
    skillName: 'internal-skill',
    constraints: { privateConstraint: 'not for the browser' },
    plan: [{ toolName: 'internal-tool-name', arguments: { internal: true } }],
    successCriteria: ['internal criterion'],
  },
  handoff: {
    ...result.handoff,
    reason: 'INTERNAL_HANDOFF_REASON',
    goal: 'INTERNAL_HANDOFF_GOAL',
    attemptedTools: ['private-tool-a'],
    successfulTools: ['private-tool-b'],
    failedTools: ['private-tool-c'],
    evidenceCount: 99,
  },
};

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => branchFindUnique.mockResolvedValue({ status: 'ACTIVE' }));
beforeEach(() => {
  rentalOrderFindMany.mockResolvedValue([]);
  costumeUnitFindMany.mockResolvedValue([]);
});

describe('agent service response contracts', () => {
  it('proxies an overdue follow-up confirmation with the authenticated actor scope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: result, message: 'Prepared' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const input = {
      analysisId: '10000000-0000-4000-8000-000000000006',
      expectedVersion: 3,
      channel: 'PHONE' as const,
      outcome: 'NO_ANSWER' as const,
      occurredAt: new Date('2020-10-19T12:00:00.000Z'),
      nextFollowUpAt: new Date('2026-10-20T09:00:00.000Z'),
    };

    await expect(
      prepareOverdueFollowUpConfirmation(caseId, input, branchActor),
    ).resolves.toMatchObject({ caseId });
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe(`/api/v1/agent/cases/${caseId}/overdue-follow-ups/confirmations`);
    expect(typeof init.body).toBe('string');
    if (typeof init.body !== 'string') throw new Error('Expected serialized request body');
    expect(JSON.parse(init.body) as unknown).toMatchObject({
      analysisId: input.analysisId,
      expectedVersion: 3,
      outcome: 'NO_ANSWER',
      occurredAt: '2020-10-19T12:00:00.000Z',
    });
  });

  it('proxies readiness analysis with the claimed actor scope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { ...result, state: 'PLAN_READY' },
          message: 'Analysis ready',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(analyzeAgentCase(caseId, 3, branchActor)).resolves.toMatchObject({
      state: 'PLAN_READY',
    });
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe(`/api/v1/agent/cases/${caseId}/analyze`);
    expect(typeof init.body).toBe('string');
    if (typeof init.body !== 'string') throw new Error('Expected a JSON request body');
    expect(JSON.parse(init.body)).toEqual({ expectedVersion: 3 });
  });
  it('does not turn branch agent permission into internal knowledge access for a new case', async () => {
    await expect(
      sendAgentMessage({ message: 'Create a new case', branchId }, branchActor),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('preserves claim conflict codes returned by the AI service', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            error: {
              code: 'AGENT_CASE_ALREADY_CLAIMED',
              message: 'Agent case is already claimed',
            },
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(claimAgentCase(caseId, 3, branchActor)).rejects.toMatchObject({
      statusCode: 409,
      code: 'AGENT_CASE_ALREADY_CLAIMED',
    });
  });

  it('parses the nested result envelope returned by the message endpoint', async () => {
    branchFindUnique.mockResolvedValue({ status: 'ACTIVE' });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, data: { result: upstreamResult }, message: 'ok' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      sendAgentMessage({ message: 'Help me rent a costume.', branchId }, actor),
    ).resolves.toEqual(result);
    expect(JSON.parse((fetchMock.mock.calls[0] as [URL, RequestInit])[1].body as string)).toEqual({
      message: 'Help me rent a costume.',
      branchId,
    });
  });

  it('does not create an Ops Agent case for a customer actor', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const customer = {
      ...actor,
      status: 'ACTIVE',
      employee: null,
      roleAssignments: [
        {
          branchId: null,
          branch: null,
          role: { actorGroup: 'CUSTOMER', isActive: true, rolePermissions: [] },
        },
      ],
    } as unknown as AuthenticatedActor;

    branchFindUnique.mockResolvedValue({ status: 'ACTIVE' });
    await expect(
      sendAgentMessage({ message: 'Help me rent a costume.', branchId }, customer),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'STAFF_ACCESS_REQUIRED',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a branch without knowledge.read permission before calling AI', async () => {
    branchFindUnique.mockResolvedValue({ status: 'ACTIVE' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const unauthorized = {
      ...actor,
      roleAssignments: [
        { ...actor.roleAssignments[0], branchId: '10000000-0000-4000-8000-000000000006' },
      ],
    } as AuthenticatedActor;

    await expect(
      sendAgentMessage({ message: 'Help me rent a costume.', branchId }, unauthorized),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a non-active branch before calling AI', async () => {
    branchFindUnique.mockResolvedValue({ status: 'INACTIVE' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      sendAgentMessage({ message: 'Help me rent a costume.', branchId }, actor),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_AGENT_BRANCH' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parses the direct case envelope returned by case and action endpoints', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, data: upstreamResult, message: 'Agent case retrieved' }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      ),
    );

    branchFindUnique.mockResolvedValue({ status: 'ACTIVE' });
    await expect(getAgentCase(caseId, branchId, actor)).resolves.toEqual(result);
  });

  it('allows branch agent staff to read a case without a separate knowledge grant', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, data: result, message: 'Agent case retrieved' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getAgentCase(caseId, branchId, branchActor)).resolves.toEqual(result);
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('X-Knowledge-Audiences')).toBe('staff_internal,shared');
    expect(headers.get('X-Agent-Read-Branch-Ids')).toBe(branchId);
  });

  it('forwards branch agent scopes and parses the operational case queue', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { items: [{ ...result, version: 3, branchId }], nextCursor: 'next-page' },
          message: 'Agent case queue retrieved',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      listAgentCases(
        { branchId, state: 'NEW', ownership: 'unassigned', cursor: 'cursor-1', limit: 10 },
        branchActor,
        'request-1',
      ),
    ).resolves.toMatchObject({ nextCursor: 'next-page' });

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe('/api/v1/agent/cases');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      ownership: 'unassigned',
      limit: '10',
      branchId,
      state: 'NEW',
      cursor: 'cursor-1',
    });
    const headers = new Headers(init.headers);
    expect(headers.get('X-Agent-Read-Branch-Ids')).toBe(branchId);
    expect(headers.get('X-Agent-Manage-Branch-Ids')).toBe(branchId);
    expect(headers.get('X-Agent-Read-All')).toBe('false');
    expect(headers.get('X-Agent-Manage-All')).toBe('false');
    expect(headers.get('X-Request-Id')).toBe('request-1');
  });

  it('returns a branch-scoped, PII-minimized operational case projection', async () => {
    const actorWithBusinessRead = {
      ...branchActor,
      roleAssignments: [
        {
          ...branchActor.roleAssignments[0],
          role: {
            ...branchActor.roleAssignments[0]!.role,
            rolePermissions: [
              ...branchActor.roleAssignments[0]!.role.rolePermissions,
              {
                permission: {
                  code: 'rentals.read.branch',
                  module: 'rentals',
                  action: 'read',
                  scope: 'BRANCH',
                },
              },
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
    const caseWithFinding = {
      ...result,
      branchId,
      ownerActorId: actorWithBusinessRead.id,
      version: 2,
      finding: {
        findingId: caseId,
        ruleCode: 'PREVIOUS_RENTAL_NOT_RETURNED',
        ruleVersion: 'v1',
        dedupeKey: 'opaque-key',
        primaryEntityId: primaryOrderId,
        affectedEntityId: affectedOrderId,
        unitId,
        windowStart: '2026-10-20T10:00:00.000Z',
        windowEnd: '2026-10-20T11:00:00.000Z',
        severity: 'HIGH',
        status: 'OPEN',
        evidence: { unitId, privateActorId: actorWithBusinessRead.id },
        firstDetectedAt: '2026-10-20T09:00:00.000Z',
        lastDetectedAt: '2026-10-20T09:30:00.000Z',
        resolvedAt: null,
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { items: [caseWithFinding], nextCursor: null },
          message: 'Agent case queue retrieved',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    rentalOrderFindMany.mockResolvedValue([
      {
        id: primaryOrderId,
        orderCode: 'RT-PRIMARY',
        status: 'CONFIRMED',
        plannedStartAt: new Date('2026-10-20T10:00:00.000Z'),
        plannedDueAt: new Date('2026-10-21T10:00:00.000Z'),
      },
      {
        id: affectedOrderId,
        orderCode: 'RT-AFFECTED',
        status: 'ACTIVE',
        plannedStartAt: new Date('2026-10-19T10:00:00.000Z'),
        plannedDueAt: new Date('2026-10-20T10:00:00.000Z'),
      },
    ]);
    costumeUnitFindMany.mockResolvedValue([
      {
        id: unitId,
        unitCode: 'UNIT-007',
        operationalStatus: 'RENTED',
        conditionGrade: 'GOOD',
      },
    ]);

    const response = await listAgentCases(
      { branchId, ownership: 'all', limit: 20 },
      actorWithBusinessRead,
    );
    expect(response.items).toHaveLength(1);
    expect(response.items[0]).toMatchObject({
      ownership: 'MINE',
      relatedOrders: [
        expect.objectContaining({ orderCode: 'RT-PRIMARY' }),
        expect.objectContaining({ orderCode: 'RT-AFFECTED' }),
      ],
      relatedUnits: [{ unitCode: 'UNIT-007', operationalStatus: 'RENTED' }],
    });
    expect(response.items[0]).not.toHaveProperty('ownerActorId');
    expect(rentalOrderFindMany).toHaveBeenCalledOnce();
  });

  it('forwards global agent scopes without branch ids for an admin actor', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: result, message: 'Claimed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await claimAgentCase(caseId, 3, adminActor);

    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('X-Agent-Read-Branch-Ids')).toBe('');
    expect(headers.get('X-Agent-Manage-Branch-Ids')).toBe('');
    expect(headers.get('X-Agent-Read-All')).toBe('true');
    expect(headers.get('X-Agent-Manage-All')).toBe('true');
  });

  it.each([
    {
      name: 'claim',
      invoke: () => claimAgentCase(caseId, 3, branchActor),
      path: `/api/v1/agent/cases/${caseId}/claim`,
    },
    {
      name: 'release',
      invoke: () => releaseAgentCase(caseId, 4, branchActor),
      path: `/api/v1/agent/cases/${caseId}/release`,
    },
  ])('forwards expectedVersion for $name', async ({ invoke, path }) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: result, message: 'Updated' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(invoke()).resolves.toEqual(result);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe(path);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ expectedVersion: path.endsWith('/claim') ? 3 : 4 }));
  });

  it.each([
    {
      name: 'confirm confirmation',
      invoke: () => confirmAgentCase(caseId, confirmationId, branchId, actor),
      path: `/api/v1/agent/cases/${caseId}/confirmations/${confirmationId}/confirm`,
      body: undefined,
    },
    {
      name: 'reject confirmation',
      invoke: () => rejectAgentCaseConfirmation(caseId, confirmationId, branchId, actor),
      path: `/api/v1/agent/cases/${caseId}/confirmations/${confirmationId}/reject`,
      body: undefined,
    },
    {
      name: 'cancel case',
      invoke: () => cancelAgentCase(caseId, branchId, actor),
      path: `/api/v1/agent/cases/${caseId}/cancel`,
      body: undefined,
    },
    {
      name: 'approve action',
      invoke: () =>
        approveAgentAction(approvalId, branchId, actor, undefined, { reason: 'Reviewed' }),
      path: `/api/v1/agent/approvals/${approvalId}/approve`,
      body: JSON.stringify({ reason: 'Reviewed' }),
    },
    {
      name: 'reject action',
      invoke: () => rejectAgentAction(approvalId, branchId, actor, undefined, { reason: 'Denied' }),
      path: `/api/v1/agent/approvals/${approvalId}/reject`,
      body: JSON.stringify({ reason: 'Denied' }),
    },
  ])(
    'parses the direct envelope and forwards the $name request',
    async ({ invoke, path, body }) => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: upstreamResult,
            message: 'Agent action completed',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
      vi.stubGlobal('fetch', fetchMock);
      branchFindUnique.mockResolvedValue({ status: 'ACTIVE' });

      await expect(invoke()).resolves.toEqual(result);
      const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe(path);
      expect(init.method).toBe('POST');
      expect(init.body).toBe(body);
      expect(new Headers(init.headers).get('X-Case-Branch-Id')).toBe(branchId);
    },
  );
});
