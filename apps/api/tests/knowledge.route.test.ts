import { SignJWT } from 'jose';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as KnowledgeService from '../src/modules/knowledge/knowledge.service.js';

process.env.JWT_ACCESS_SECRET = 'knowledge-route-test-secret-at-least-32-bytes';

const mocks = vi.hoisted(() => ({
  answerKnowledge: vi.fn(),
  findUser: vi.fn(),
}));

vi.mock('../src/modules/knowledge/knowledge.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof KnowledgeService>();
  return { ...actual, answerKnowledge: mocks.answerKnowledge };
});
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    user: { findUnique: mocks.findUser },
  },
}));

const { createApp } = await import('../src/app.js');

const userId = '10000000-0000-4000-8000-000000000001';
const result = {
  outcome: 'insufficient_context',
  answer: 'Chưa đủ dữ liệu đã được duyệt để trả lời.',
  sources: [],
  provisional: false,
};

interface KnowledgeRouteResponse {
  data: { result: typeof result };
}

interface ErrorRouteResponse {
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
  mocks.answerKnowledge.mockResolvedValue(result);
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
describe('POST /api/v1/knowledge/answer', () => {
  it('allows a guest without querying authentication state', async () => {
    const response = await request(createApp())
      .post('/api/v1/knowledge/answer')
      .send({ query: 'Tôi trả đồ ở đâu?' })
      .expect(200);

    expect((response.body as KnowledgeRouteResponse).data.result).toEqual(result);
    expect(mocks.findUser).not.toHaveBeenCalled();
    expect(mocks.answerKnowledge).toHaveBeenCalledWith(
      { query: 'Tôi trả đồ ở đâu?', topK: 5 },
      expect.objectContaining({
        actor: { userId: 'guest', audiences: ['customer', 'shared'] },
      }),
    );
  });

  it('validates and forwards a supplied valid token', async () => {
    const token = await accessToken();
    await request(createApp())
      .post('/api/v1/knowledge/answer')
      .set('Authorization', `Bearer ${token}`)
      .send({ query: 'Chính sách trả đồ?', topK: 4 })
      .expect(200);

    expect(mocks.findUser).toHaveBeenCalledTimes(1);
    expect(mocks.answerKnowledge).toHaveBeenCalledWith(
      { query: 'Chính sách trả đồ?', topK: 4 },
      expect.objectContaining({
        actor: { userId, audiences: ['customer', 'shared'] },
      }),
    );
  });

  it('maps an authorized staff actor to internal knowledge audiences', async () => {
    mocks.findUser.mockResolvedValueOnce({
      id: userId,
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
                  code: 'knowledge.read.all',
                  module: 'knowledge',
                  action: 'read',
                  scope: 'ALL',
                },
              },
            ],
          },
        },
      ],
    });

    const token = await accessToken();
    await request(createApp())
      .post('/api/v1/knowledge/answer')
      .set('Authorization', `Bearer ${token}`)
      .send({ query: 'Internal process?' })
      .expect(200);

    expect(mocks.answerKnowledge).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        actor: { userId, audiences: ['staff_internal', 'shared'] },
      }),
    );
  });

  it('rejects an authenticated actor without knowledge access', async () => {
    mocks.findUser.mockResolvedValueOnce({
      id: userId,
      status: 'ACTIVE',
      employee: { employmentStatus: 'ACTIVE' },
      roleAssignments: [
        {
          branchId: null,
          branch: null,
          role: { actorGroup: 'STAFF', isActive: true, rolePermissions: [] },
        },
      ],
    });

    const token = await accessToken();
    const response = await request(createApp())
      .post('/api/v1/knowledge/answer')
      .set('Authorization', `Bearer ${token}`)
      .send({ query: 'Internal process?' })
      .expect(403);

    expect((response.body as ErrorRouteResponse).error.code).toBe('FORBIDDEN');
    expect(mocks.answerKnowledge).not.toHaveBeenCalled();
  });

  it('does not elevate a branch-bound ALL permission to global knowledge access', async () => {
    mocks.findUser.mockResolvedValueOnce({
      id: userId,
      status: 'ACTIVE',
      employee: { employmentStatus: 'ACTIVE' },
      roleAssignments: [
        {
          branchId: '20000000-0000-4000-8000-000000000001',
          branch: { status: 'ACTIVE' },
          role: {
            actorGroup: 'STAFF',
            isActive: true,
            rolePermissions: [
              {
                permission: {
                  code: 'knowledge.read.all',
                  module: 'knowledge',
                  action: 'read',
                  scope: 'ALL',
                },
              },
            ],
          },
        },
      ],
    });

    const token = await accessToken();
    const response = await request(createApp())
      .post('/api/v1/knowledge/answer')
      .set('Authorization', `Bearer ${token}`)
      .send({ query: 'Internal process?' })
      .expect(403);

    expect((response.body as ErrorRouteResponse).error.code).toBe('FORBIDDEN');
    expect(mocks.answerKnowledge).not.toHaveBeenCalled();
  });

  it('rejects invalid supplied credentials instead of downgrading to guest', async () => {
    const response = await request(createApp())
      .post('/api/v1/knowledge/answer')
      .set('Authorization', 'Bearer invalid')
      .send({ query: 'Chính sách trả đồ?' })
      .expect(401);

    expect((response.body as ErrorRouteResponse).error.code).toBe('INVALID_ACCESS_TOKEN');
    expect(mocks.answerKnowledge).not.toHaveBeenCalled();
  });

  it('ignores actor headers supplied by a guest client', async () => {
    await request(createApp())
      .post('/api/v1/knowledge/answer')
      .set('X-Actor-Id', 'forged-staff-id')
      .set('X-Knowledge-Audiences', 'staff_internal,shared')
      .send({ query: 'Where do I return the costume?' })
      .expect(200);

    expect(mocks.answerKnowledge).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        actor: { userId: 'guest', audiences: ['customer', 'shared'] },
      }),
    );
  });

  it('rejects invalid request bodies before calling the AI service', async () => {
    await request(createApp())
      .post('/api/v1/knowledge/answer')
      .send({ query: 'x', topK: 99 })
      .expect(400);
    expect(mocks.answerKnowledge).not.toHaveBeenCalled();
  });
});
