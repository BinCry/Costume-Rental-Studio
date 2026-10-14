import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertPermission: vi.fn(),
  create: vi.fn(),
  findFirst: vi.fn(),
  transaction: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../src/database/prisma.js', () => ({
  prisma: { $transaction: mocks.transaction },
}));
vi.mock('../src/modules/auth/authorization.js', () => ({
  assertPermission: mocks.assertPermission,
}));

import { createPolicy } from '../src/modules/policies/policy.service.js';
import { policySchema } from '../src/modules/policies/policy.schema.js';

const policyInput = {
  versionCode: 'POLICY-2026-TEST',
  effectiveFrom: '2026-10-14T00:00:00.000Z',
  billingDayMode: 'ROLLING_24_HOURS',
  quoteValidHours: 24,
  changeReason: 'Kiểm tra policy mới.',
};

const actor = { id: '10000000-0000-4000-8000-000000000001' } as never;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findFirst.mockResolvedValue({
    id: '10000000-0000-4000-8000-000000000002',
    effectiveFrom: new Date('2025-01-01T00:00:00.000Z'),
    effectiveTo: null,
    lateFeeFormulaVersion: 2,
  });
  mocks.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => data);
  mocks.transaction.mockImplementation(
    (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        rentalPolicyVersion: {
          findFirst: mocks.findFirst,
          update: mocks.update,
          create: mocks.create,
        },
      }),
  );
});

function createdPolicyData(): Record<string, unknown> {
  const call: unknown = mocks.create.mock.calls[0];
  if (!call || typeof call !== 'object' || !('data' in call)) {
    throw new Error('Policy create call was not recorded');
  }
  const data: unknown = call.data;
  if (!data || typeof data !== 'object') {
    throw new Error('Policy create call did not contain data');
  }
  return data as Record<string, unknown>;
}

describe('policy fee formula version', () => {
  it('preserves the current formula when a new version changes only scheduling policy', async () => {
    const parsed = policySchema.parse(policyInput);
    await createPolicy(actor, parsed);
    expect(createdPolicyData().lateFeeFormulaVersion).toBe(2);
  });

  it('allows an explicitly selected fee formula version', async () => {
    const parsed = policySchema.parse({ ...policyInput, lateFeeFormulaVersion: 1 });
    await createPolicy(actor, parsed);
    expect(createdPolicyData().lateFeeFormulaVersion).toBe(1);
  });
});
