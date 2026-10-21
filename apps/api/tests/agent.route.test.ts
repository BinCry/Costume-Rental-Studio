import { SignJWT } from 'jose';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.JWT_ACCESS_SECRET = 'agent-route-test-secret-at-least-32-bytes';

const mocks = vi.hoisted(() => ({
  analyzeCase: vi.fn(),
  approveAction: vi.fn(),
  claimCase: vi.fn(),
  findUser: vi.fn(),
  getCase: vi.fn(),
  listCases: vi.fn(),
  prepareConfirmation: vi.fn(),
  prepareOverdueFollowUp: vi.fn(),
  releaseCase: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock('../src/modules/agent/agent.service.js', () => ({
  analyzeAgentCase: mocks.analyzeCase,
  approveAgentAction: mocks.approveAction,
  cancelAgentCase: vi.fn(),
  claimAgentCase: mocks.claimCase,
  confirmAgentCase: vi.fn(),
  getAgentCase: mocks.getCase,
  listAgentCases: mocks.listCases,
  prepareReadinessConfirmation: mocks.prepareConfirmation,
  prepareOverdueFollowUpConfirmation: mocks.prepareOverdueFollowUp,
  releaseAgentCase: mocks.releaseCase,
  sendAgentMessage: mocks.sendMessage,
  rejectAgentAction: vi.fn(),
  rejectAgentCaseConfirmation: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    user: { findUnique: mocks.findUser },
  },
}));

const { createApp } = await import('../src/app.js');

const userId = '10000000-0000-4000-8000-000000000001';
const caseId = '10000000-0000-4000-8000-000000000002';
const branchId = '10000000-0000-4000-8000-000000000006';
const result = {
  caseId,
  state: 'SUCCEEDED',
  message: 'Thông tin đã được trả lời từ nguồn được phép.',
  evidence: [],
  pendingConfirmation: null,
  pendingApproval: null,
  completed: true,
};

interface AgentRouteResponse {
  data: typeof result;
}

interface AgentRouteErrorResponse {
  error: { code: string };
}

async function accessToken() {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer('costume-api')
    .setAudience('costume-web')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(process.env.JWT_ACCESS_SECRET));
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.sendMessage.mockResolvedValue(result);
  mocks.getCase.mockResolvedValue(result);
  mocks.approveAction.mockResolvedValue(result);
  mocks.claimCase.mockResolvedValue({ ...result, version: 4, branchId });
  mocks.listCases.mockResolvedValue({
    items: [{ ...result, version: 3, branchId }],
    nextCursor: null,
  });
  mocks.releaseCase.mockResolvedValue({ ...result, version: 5, branchId });
  mocks.analyzeCase.mockResolvedValue({ ...result, state: 'PLAN_READY', version: 6, branchId });
  mocks.prepareOverdueFollowUp.mockResolvedValue({
    ...result,
    state: 'WAITING_CONFIRMATION',
    version: 7,
    branchId,
  });
  mocks.findUser.mockResolvedValue({
    id: userId,
    email: 'staff@example.com',
    phone: null,
    displayName: 'Nhân viên',
    status: 'ACTIVE',
    avatarUrl: null,
    employee: { employmentStatus: 'ACTIVE' },
    roleAssignments: [
      {
        branchId: '10000000-0000-4000-8000-000000000006',
        branch: { status: 'ACTIVE' },
        role: {
          roleCode: 'SALES_STAFF',
          name: 'Nhân viên bán hàng',
          actorGroup: 'STAFF',
          isActive: true,
          rolePermissions: [],
        },
      },
    ],
  });
});

function staffActor() {
  return {
    id: userId,
    email: 'staff@example.com',
    phone: null,
    displayName: 'Staff',
    status: 'ACTIVE',
    avatarUrl: null,
    employee: { employmentStatus: 'ACTIVE' },
    roleAssignments: [
      {
        branchId,
        branch: { status: 'ACTIVE' },
        role: {
          roleCode: 'SALES_STAFF',
          name: 'Sales staff',
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
  };
}

function globalAdminActor() {
  return {
    id: userId,
    email: 'admin@example.com',
    phone: null,
    displayName: 'Admin',
    status: 'ACTIVE',
    avatarUrl: null,
    employee: { employmentStatus: 'ACTIVE' },
    roleAssignments: [
      {
        branchId: null,
        branch: null,
        role: {
          roleCode: 'ADMIN',
          name: 'Quản trị viên',
          actorGroup: 'ADMIN',
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
  };
}

describe('Agent public API', () => {
  it('requires an authenticated actor before sending an agent message', async () => {
    await request(createApp())
      .post('/api/v1/agent/messages')
      .send({ message: 'Tình trạng đơn của tôi?' })
      .expect(401);

    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('uses only the JWT-authenticated actor and validates the message contract', async () => {
    const token = await accessToken();
    const response = await request(createApp())
      .post('/api/v1/agent/messages')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Actor-Id', 'forged-user-id')
      .send({ message: 'Tình trạng đơn của tôi?', branchId })
      .expect(200);

    expect((response.body as AgentRouteResponse).data).toEqual(result);
    expect(mocks.sendMessage).toHaveBeenCalledWith(
      { message: 'Tình trạng đơn của tôi?', branchId },
      expect.objectContaining({ id: userId }),
      expect.any(String),
    );
  });

  it('requires a valid branch identifier in the message contract', async () => {
    const token = await accessToken();
    await request(createApp())
      .post('/api/v1/agent/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Tình trạng đơn của tôi?' })
      .expect(400);

    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('denies customers access to the staff Ops Agent API', async () => {
    mocks.findUser.mockResolvedValueOnce({
      id: userId,
      email: 'customer@example.com',
      phone: null,
      displayName: 'Khách hàng',
      status: 'ACTIVE',
      avatarUrl: null,
      employee: null,
      roleAssignments: [
        {
          branchId: null,
          branch: null,
          role: {
            roleCode: 'CUSTOMER',
            name: 'Khách hàng',
            actorGroup: 'CUSTOMER',
            isActive: true,
            rolePermissions: [],
          },
        },
      ],
    });
    const token = await accessToken();

    const response = await request(createApp())
      .post('/api/v1/agent/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Tra cứu đơn của tôi' })
      .expect(403);

    expect((response.body as AgentRouteErrorResponse).error.code).toBe('STAFF_ACCESS_REQUIRED');
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('rejects invalid case identifiers before proxying to the AI service', async () => {
    const token = await accessToken();
    await request(createApp())
      .get('/api/v1/agent/cases/not-a-uuid')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    expect(mocks.getCase).not.toHaveBeenCalled();
  });

  it('loads an owned case through the authenticated actor only', async () => {
    const token = await accessToken();
    const response = await request(createApp())
      .get(`/api/v1/agent/cases/${caseId}`)
      .set('X-Branch-Id', branchId)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect((response.body as AgentRouteResponse).data).toEqual(result);
    expect(mocks.getCase).toHaveBeenCalledWith(
      caseId,
      branchId,
      expect.objectContaining({ id: userId }),
      expect.any(String),
    );
  });

  it('requires the selected branch header when loading a case', async () => {
    const token = await accessToken();
    await request(createApp())
      .get(`/api/v1/agent/cases/${caseId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    expect(mocks.getCase).not.toHaveBeenCalled();
  });

  it('lists branch cases with validated filters for authorized staff', async () => {
    mocks.findUser.mockResolvedValueOnce(staffActor());
    const token = await accessToken();
    const response = await request(createApp())
      .get(`/api/v1/agent/cases?branchId=${branchId}&state=NEW&ownership=unassigned&limit=15`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect((response.body as { data: { items: unknown[] } }).data.items).toHaveLength(1);
    expect(mocks.listCases).toHaveBeenCalledWith(
      { branchId, state: 'NEW', ownership: 'unassigned', limit: 15 },
      expect.objectContaining({ id: userId }),
      expect.any(String),
    );
  });

  it('allows a global administrator with ALL permission to list cases by branch', async () => {
    mocks.findUser.mockResolvedValueOnce(globalAdminActor());
    const token = await accessToken();
    const response = await request(createApp())
      .get(`/api/v1/agent/cases?branchId=${branchId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect((response.body as { data: { items: unknown[] } }).data.items).toHaveLength(1);
    expect(mocks.listCases).toHaveBeenCalledWith(
      { branchId, limit: 30, ownership: 'all' },
      expect.objectContaining({ id: userId }),
      expect.any(String),
    );
  });

  it('rejects operational queue access without agent read permission', async () => {
    const token = await accessToken();
    await request(createApp())
      .get('/api/v1/agent/cases')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(mocks.listCases).not.toHaveBeenCalled();
  });

  it.each([
    { action: 'claim', expectedVersion: 3, mock: mocks.claimCase },
    { action: 'release', expectedVersion: 4, mock: mocks.releaseCase },
  ])(
    'proxies $action with a validated expected version',
    async ({ action, expectedVersion, mock }) => {
      mocks.findUser.mockResolvedValueOnce(staffActor());
      const token = await accessToken();
      await request(createApp())
        .post(`/api/v1/agent/cases/${caseId}/${action}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ expectedVersion })
        .expect(200);

      expect(mock).toHaveBeenCalledWith(
        caseId,
        expectedVersion,
        expect.objectContaining({ id: userId }),
        expect.any(String),
      );
    },
  );

  it('starts read-only readiness analysis only for authorized staff with a version', async () => {
    mocks.findUser.mockResolvedValueOnce(staffActor());
    const token = await accessToken();
    await request(createApp())
      .post(`/api/v1/agent/cases/${caseId}/analyze`)
      .set('Authorization', `Bearer ${token}`)
      .send({ expectedVersion: 5 })
      .expect(200);

    expect(mocks.analyzeCase).toHaveBeenCalledWith(
      caseId,
      5,
      expect.objectContaining({ id: userId }),
      expect.any(String),
    );
  });

  it('prepares readiness confirmation with only analysis ID and case version', async () => {
    mocks.findUser.mockResolvedValueOnce(staffActor());
    mocks.prepareConfirmation.mockResolvedValue({
      ...result,
      state: 'WAITING_CONFIRMATION',
      version: 7,
      branchId,
    });
    const token = await accessToken();
    const analysisId = '10000000-0000-4000-8000-000000000004';
    await request(createApp())
      .post(`/api/v1/agent/cases/${caseId}/confirmations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ analysisId, expectedVersion: 6 })
      .expect(200);

    expect(mocks.prepareConfirmation).toHaveBeenCalledWith(
      caseId,
      analysisId,
      6,
      expect.objectContaining({ id: userId }),
      expect.any(String),
    );
  });

  it('validates and proxies an overdue follow-up confirmation', async () => {
    mocks.findUser.mockResolvedValueOnce(staffActor());
    const token = await accessToken();
    const analysisId = '10000000-0000-4000-8000-000000000004';
    await request(createApp())
      .post(`/api/v1/agent/cases/${caseId}/overdue-follow-ups/confirmations`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        analysisId,
        expectedVersion: 6,
        channel: 'PHONE',
        outcome: 'NO_ANSWER',
        occurredAt: '2020-10-19T12:00:00.000Z',
        nextFollowUpAt: '2026-10-20T09:00:00.000Z',
      })
      .expect(200);

    expect(mocks.prepareOverdueFollowUp).toHaveBeenCalledWith(
      caseId,
      expect.objectContaining({
        analysisId,
        expectedVersion: 6,
        outcome: 'NO_ANSWER',
        occurredAt: new Date('2020-10-19T12:00:00.000Z'),
      }),
      expect.objectContaining({ id: userId }),
      expect.any(String),
    );
  });

  it('rejects an overdue outcome without its required next follow-up', async () => {
    mocks.findUser.mockResolvedValueOnce(staffActor());
    const token = await accessToken();
    await request(createApp())
      .post(`/api/v1/agent/cases/${caseId}/overdue-follow-ups/confirmations`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        analysisId: '10000000-0000-4000-8000-000000000004',
        expectedVersion: 6,
        channel: 'PHONE',
        outcome: 'NO_ANSWER',
        occurredAt: '2020-10-19T12:00:00.000Z',
      })
      .expect(400);

    expect(mocks.prepareOverdueFollowUp).not.toHaveBeenCalled();
  });

  it('rejects an overdue promised-return time that is no longer in the future', async () => {
    mocks.findUser.mockResolvedValueOnce(staffActor());
    const token = await accessToken();
    await request(createApp())
      .post(`/api/v1/agent/cases/${caseId}/overdue-follow-ups/confirmations`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        analysisId: '10000000-0000-4000-8000-000000000004',
        expectedVersion: 6,
        channel: 'PHONE',
        outcome: 'PROMISED_RETURN',
        occurredAt: '2020-10-19T12:00:00.000Z',
        promisedReturnAt: new Date(Date.now() - 60_000).toISOString(),
      })
      .expect(400);

    expect(mocks.prepareOverdueFollowUp).not.toHaveBeenCalled();
  });

  it('validates ownership mutation bodies before proxying', async () => {
    mocks.findUser.mockResolvedValueOnce(staffActor());
    const token = await accessToken();
    await request(createApp())
      .post(`/api/v1/agent/cases/${caseId}/claim`)
      .set('Authorization', `Bearer ${token}`)
      .send({ expectedVersion: 0 })
      .expect(400);

    expect(mocks.claimCase).not.toHaveBeenCalled();
  });

  it('proxies an approval decision with the authenticated approver', async () => {
    const token = await accessToken();
    const approvalId = '10000000-0000-4000-8000-000000000003';
    await request(createApp())
      .post(`/api/v1/agent/approvals/${approvalId}/approve`)
      .set('X-Branch-Id', branchId)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Reviewed' })
      .expect(200);

    expect(mocks.approveAction).toHaveBeenCalledWith(
      approvalId,
      branchId,
      expect.objectContaining({ id: userId }),
      expect.any(String),
      { reason: 'Reviewed' },
    );
  });
});
