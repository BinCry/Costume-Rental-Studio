import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AuthenticatedActor } from '../src/modules/auth/authorization.js';

const {
  approveAgentAction,
  cancelAgentCase,
  confirmAgentCase,
  getAgentCase,
  rejectAgentAction,
  rejectAgentCaseConfirmation,
  sendAgentMessage,
} = await import('../src/modules/agent/agent.service.js');

const caseId = '10000000-0000-4000-8000-000000000002';
const confirmationId = '10000000-0000-4000-8000-000000000003';
const approvalId = '10000000-0000-4000-8000-000000000004';
const actor = {
  id: '10000000-0000-4000-8000-000000000001',
  status: 'ACTIVE',
  employee: { employmentStatus: 'ACTIVE' },
  roleAssignments: [
    {
      branchId: '10000000-0000-4000-8000-000000000005',
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

const result = {
  caseId,
  state: 'INSUFFICIENT_DATA',
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

describe('agent service response contracts', () => {
  it('parses the nested result envelope returned by the message endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              success: true,
              data: { result: upstreamResult },
              message: 'Agent message completed',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
    );

    await expect(sendAgentMessage({ message: 'Help me rent a costume.' }, actor)).resolves.toEqual(
      result,
    );
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

    await expect(sendAgentMessage({ message: 'Help me rent a costume.' }, customer)).rejects.toMatchObject({
      statusCode: 403,
      code: 'STAFF_ACCESS_REQUIRED',
    });
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

    await expect(getAgentCase(caseId, actor)).resolves.toEqual(result);
  });

  it.each([
    {
      name: 'confirm confirmation',
      invoke: () => confirmAgentCase(caseId, confirmationId, actor),
      path: `/api/v1/agent/cases/${caseId}/confirmations/${confirmationId}/confirm`,
      body: undefined,
    },
    {
      name: 'reject confirmation',
      invoke: () => rejectAgentCaseConfirmation(caseId, confirmationId, actor),
      path: `/api/v1/agent/cases/${caseId}/confirmations/${confirmationId}/reject`,
      body: undefined,
    },
    {
      name: 'cancel case',
      invoke: () => cancelAgentCase(caseId, actor),
      path: `/api/v1/agent/cases/${caseId}/cancel`,
      body: undefined,
    },
    {
      name: 'approve action',
      invoke: () => approveAgentAction(approvalId, actor, undefined, { reason: 'Reviewed' }),
      path: `/api/v1/agent/approvals/${approvalId}/approve`,
      body: JSON.stringify({ reason: 'Reviewed' }),
    },
    {
      name: 'reject action',
      invoke: () => rejectAgentAction(approvalId, actor, undefined, { reason: 'Denied' }),
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

      await expect(invoke()).resolves.toEqual(result);
      const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe(path);
      expect(init.method).toBe('POST');
      expect(init.body).toBe(body);
    },
  );
});
