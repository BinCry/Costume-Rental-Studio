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
  employee: null,
  roleAssignments: [
    {
      branchId: null,
      branch: null,
      role: {
        actorGroup: 'CUSTOMER',
        isActive: true,
        rolePermissions: [],
      },
    },
  ],
} as unknown as AuthenticatedActor;

const result = {
  caseId,
  state: 'INSUFFICIENT_DATA',
  message: 'Please provide more information.',
  evidence: [],
  runStatus: 'COMPLETED',
  goal: null,
  stepsUsed: 1,
  tokensUsed: 10,
  terminationReason: 'INSUFFICIENT_DATA',
  pendingInput: null,
  pendingConfirmation: null,
  pendingApproval: null,
  handoff: null,
  completed: true,
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
            JSON.stringify({ success: true, data: { result }, message: 'Agent message completed' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
    );

    await expect(sendAgentMessage({ message: 'Help me rent a costume.' }, actor)).resolves.toEqual(
      result,
    );
  });

  it('parses the direct case envelope returned by case and action endpoints', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, data: result, message: 'Agent case retrieved' }),
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
          JSON.stringify({ success: true, data: result, message: 'Agent action completed' }),
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
