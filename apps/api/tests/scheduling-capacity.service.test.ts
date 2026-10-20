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
  transaction: vi.fn(),
  queryRaw: vi.fn(),
  unitFindUniqueOrThrow: vi.fn(),
  windowFindUnique: vi.fn(),
}));

vi.mock('../src/database/prisma.js', () => ({
  prisma: { $transaction: mocks.transaction },
}));

const { createUnitBlock } = await import('../src/modules/scheduling/scheduling.service.js');

const branchId = '40000000-0000-4000-8000-000000000001';
const otherBranchId = '40000000-0000-4000-8000-000000000002';
const unitId = '40000000-0000-4000-8000-000000000003';
const capacityWindowId = '40000000-0000-4000-8000-000000000004';

const actor = {
  id: '40000000-0000-4000-8000-000000000005',
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
              code: 'inventory.manage.branch',
              module: 'inventory',
              action: 'manage',
              scope: 'BRANCH',
            },
          },
        ],
      },
    },
  ],
} as unknown as AuthenticatedActor;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queryRaw.mockResolvedValue([{ id: unitId }]);
  mocks.unitFindUniqueOrThrow.mockResolvedValue({ id: unitId, currentBranchId: branchId });
  mocks.transaction.mockImplementation((work: (tx: unknown) => Promise<unknown>) =>
    work({
      $queryRaw: mocks.queryRaw,
      costumeUnit: { findUniqueOrThrow: mocks.unitFindUniqueOrThrow },
      branchCapacityWindow: { findUnique: mocks.windowFindUnique },
    }),
  );
});

describe('unit-block capacity assignment', () => {
  it('rejects a capacity window owned by a different branch', async () => {
    mocks.windowFindUnique.mockResolvedValue({ branchId: otherBranchId });

    await expect(
      createUnitBlock(actor, {
        unitId,
        capacityWindowId,
        blockType: 'REPAIR',
        blockedFrom: new Date('2026-10-20T08:00:00Z'),
        blockedUntil: new Date('2026-10-20T10:00:00Z'),
        estimatedEffortMinutes: 90,
        reason: 'Repair damaged seam',
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CAPACITY_WINDOW_BRANCH_MISMATCH' });
  });
});
