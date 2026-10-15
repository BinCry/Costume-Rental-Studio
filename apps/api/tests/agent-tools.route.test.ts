import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../src/common/errors/app-error.js';

process.env.AI_INTERNAL_API_KEY = 'agent-tools-test-secret-at-least-32-bytes';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  execute: vi.fn(),
  loadActor: vi.fn(),
}));

vi.mock('../src/modules/agent-tools/agent-tools.service.js', () => ({
  authorizeAgentApproval: mocks.authorize,
  executeAgentTool: mocks.execute,
  loadInternalToolActor: mocks.loadActor,
}));

const { createApp } = await import('../src/app.js');

const ids = {
  caseId: '10000000-0000-4000-8000-000000000001',
  callId: '10000000-0000-4000-8000-000000000002',
  actorId: '10000000-0000-4000-8000-000000000003',
  requestId: '10000000-0000-4000-8000-000000000004',
  orderId: '10000000-0000-4000-8000-000000000005',
};

const internalHeaders = {
  'X-AI-Service-Key': process.env.AI_INTERNAL_API_KEY,
  'X-Actor-Id': ids.actorId,
  'X-Request-Id': ids.requestId,
  'X-Agent-Tools-Contract': 'agent-tools/v1',
};

interface ErrorResponse {
  error: { code: string };
}

interface SuccessResponse {
  data: { status: string };
}

const execution = {
  caseId: ids.caseId,
  toolCallId: ids.callId,
  idempotencyKey: 'case:call',
  toolName: 'get_rental_order',
  arguments: { orderId: ids.orderId },
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.loadActor.mockResolvedValue({ id: ids.actorId });
  mocks.execute.mockResolvedValue({
    status: 'ok',
    source: 'studio-api',
    observedAt: '2026-10-14T00:00:00.000Z',
    data: { id: ids.orderId },
  });
  mocks.authorize.mockReturnValue({ decision: 'allowed', checkedAt: '2026-10-14T00:00:00Z' });
});

describe('POST /api/v1/internal/agent-tools/execute', () => {
  it('requires the internal service key before loading an actor', async () => {
    const response = await request(createApp())
      .post('/api/v1/internal/agent-tools/execute')
      .set('X-Actor-Id', ids.actorId)
      .set('X-Request-Id', ids.requestId)
      .send(execution)
      .expect(401);

    expect((response.body as ErrorResponse).error.code).toBe('INVALID_INTERNAL_SERVICE_KEY');
    expect(mocks.loadActor).not.toHaveBeenCalled();
  });

  it('rejects incomplete trusted actor context', async () => {
    const response = await request(createApp())
      .post('/api/v1/internal/agent-tools/execute')
      .set('X-AI-Service-Key', internalHeaders['X-AI-Service-Key'])
      .set('X-Actor-Id', ids.actorId)
      .send(execution)
      .expect(400);

    expect((response.body as ErrorResponse).error.code).toBe('INVALID_ACTOR_CONTEXT');
    expect(mocks.loadActor).not.toHaveBeenCalled();
  });

  it('executes only a validated allowlisted read tool for the loaded actor', async () => {
    const response = await request(createApp())
      .post('/api/v1/internal/agent-tools/execute')
      .set(internalHeaders)
      .send(execution)
      .expect(200);

    expect(mocks.loadActor).toHaveBeenCalledWith(ids.actorId);
    expect(mocks.execute).toHaveBeenCalledWith(
      { id: ids.actorId },
      expect.objectContaining({ toolName: 'get_rental_order' }),
      ids.requestId,
    );
    expect((response.body as SuccessResponse).data.status).toBe('ok');
  });

  it('rejects arbitrary tool names before service execution', async () => {
    const response = await request(createApp())
      .post('/api/v1/internal/agent-tools/execute')
      .set(internalHeaders)
      .send({ ...execution, toolName: 'execute_sql' })
      .expect(400);

    expect((response.body as ErrorResponse).error.code).toBe('VALIDATION_ERROR');
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('normalizes known business denials instead of treating them as a protocol failure', async () => {
    mocks.execute.mockRejectedValue(new AppError(403, 'FORBIDDEN', 'Permission denied'));

    const response = await request(createApp())
      .post('/api/v1/internal/agent-tools/execute')
      .set(internalHeaders)
      .send(execution)
      .expect(200);

    expect((response.body as SuccessResponse).data.status).toBe('forbidden');
  });

  it('authorizes approval scope through the trusted Studio actor', async () => {
    const branchId = '10000000-0000-4000-8000-000000000006';
    const response = await request(createApp())
      .post('/api/v1/internal/agent-tools/authorize-approval')
      .set(internalHeaders)
      .send({ requiredPermission: 'payments:manage', branchIds: [branchId] })
      .expect(200);

    expect(mocks.loadActor).toHaveBeenCalledWith(ids.actorId);
    expect(mocks.authorize).toHaveBeenCalledWith(
      { id: ids.actorId },
      { requiredPermission: 'payments:manage', branchIds: [branchId] },
    );
    expect((response.body as { data: { decision: string } }).data.decision).toBe('allowed');
  });
});
