import { SignJWT } from 'jose';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.JWT_ACCESS_SECRET = 'agent-route-test-secret-at-least-32-bytes';

const mocks = vi.hoisted(() => ({
  approveAction: vi.fn(),
  findUser: vi.fn(),
  getCase: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock('../src/modules/agent/agent.service.js', () => ({
  approveAgentAction: mocks.approveAction,
  cancelAgentCase: vi.fn(),
  confirmAgentCase: vi.fn(),
  getAgentCase: mocks.getCase,
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
  mocks.findUser.mockResolvedValue({
    id: userId,
    email: 'customer@example.com',
    phone: null,
    displayName: 'Customer',
    status: 'ACTIVE',
    avatarUrl: null,
    employee: null,
    roleAssignments: [
      {
        branchId: null,
        branch: null,
        role: {
          roleCode: 'CUSTOMER',
          name: 'Customer',
          actorGroup: 'CUSTOMER',
          isActive: true,
          rolePermissions: [],
        },
      },
    ],
  });
});

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
      .send({ message: 'Tình trạng đơn của tôi?' })
      .expect(200);

    expect((response.body as AgentRouteResponse).data).toEqual(result);
    expect(mocks.sendMessage).toHaveBeenCalledWith(
      { message: 'Tình trạng đơn của tôi?' },
      expect.objectContaining({ id: userId }),
      expect.any(String),
    );
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
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect((response.body as AgentRouteResponse).data).toEqual(result);
    expect(mocks.getCase).toHaveBeenCalledWith(
      caseId,
      expect.objectContaining({ id: userId }),
      expect.any(String),
    );
  });

  it('proxies an approval decision with the authenticated approver', async () => {
    const token = await accessToken();
    const approvalId = '10000000-0000-4000-8000-000000000003';
    await request(createApp())
      .post(`/api/v1/agent/approvals/${approvalId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Reviewed' })
      .expect(200);

    expect(mocks.approveAction).toHaveBeenCalledWith(
      approvalId,
      expect.objectContaining({ id: userId }),
      expect.any(String),
      { reason: 'Reviewed' },
    );
  });
});
