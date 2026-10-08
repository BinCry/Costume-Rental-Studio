import { describe, expect, it } from 'vitest';

import {
  hasPermission,
  requireActor,
  type AuthenticatedActor,
} from '../src/modules/auth/authorization.js';

function actor(
  options: {
    module?: string;
    action?: string;
    scope?: 'ALL' | 'BRANCH' | 'OWN';
    branchId?: string | null;
    branchStatus?: 'ACTIVE' | 'INACTIVE';
    employmentStatus?: 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED';
    customer?: boolean;
    roleActive?: boolean;
    status?: 'ACTIVE' | 'LOCKED';
  } = {},
): AuthenticatedActor {
  const branchId = options.branchId === undefined ? 'branch-1' : options.branchId;
  return {
    status: options.status ?? 'ACTIVE',
    employee: options.customer ? null : { employmentStatus: options.employmentStatus ?? 'ACTIVE' },
    roleAssignments: [
      {
        branchId,
        branch: branchId ? { status: options.branchStatus ?? 'ACTIVE' } : null,
        role: {
          isActive: options.roleActive ?? true,
          rolePermissions: [
            {
              permission: {
                module: options.module ?? 'catalog',
                action: options.action ?? 'read',
                scope: options.scope ?? 'ALL',
              },
            },
          ],
        },
      },
    ],
  } as AuthenticatedActor;
}

describe('Authorization', () => {
  it('allows shared catalog reads from an active branch assignment', () => {
    expect(hasPermission(actor(), { module: 'catalog', action: 'read', scope: 'ALL' })).toBe(true);
  });

  it.each([
    ['catalog', 'manage'],
    ['inventory', 'read'],
    ['orders', 'read'],
  ])('keeps branch-bound ALL permissions restricted for %s.%s', (module, action) => {
    expect(hasPermission(actor({ module, action }), { module, action, scope: 'ALL' })).toBe(false);
    expect(
      hasPermission(actor({ module, action, branchId: null }), { module, action, scope: 'ALL' }),
    ).toBe(true);
  });

  it('rejects inactive branches, inactive roles, and mismatched branches', () => {
    const input = { module: 'catalog', action: 'read', scope: 'ALL' as const };
    expect(hasPermission(actor({ branchStatus: 'INACTIVE' }), input)).toBe(false);
    expect(hasPermission(actor({ roleActive: false }), input)).toBe(false);
    expect(hasPermission(actor(), { ...input, branchId: 'branch-2' })).toBe(false);
  });

  it('preserves branch-scoped matching and own-scoped permissions', () => {
    const branchActor = actor({ module: 'inventory', scope: 'BRANCH' });
    expect(
      hasPermission(branchActor, { module: 'inventory', action: 'read', branchId: 'branch-1' }),
    ).toBe(true);
    expect(hasPermission(branchActor, { module: 'inventory', action: 'read' })).toBe(false);
    expect(
      hasPermission(actor({ scope: 'OWN' }), { module: 'catalog', action: 'read', scope: 'OWN' }),
    ).toBe(true);
  });

  it.each(['ON_LEAVE', 'TERMINATED'] as const)(
    'rejects %s employees in both authorization entry points',
    (employmentStatus) => {
      const current = actor({ employmentStatus, branchId: null });
      expect(() => requireActor(current)).toThrow('Account is unavailable');
      expect(hasPermission(current, { module: 'catalog', action: 'read' })).toBe(false);
    },
  );

  it('allows active customers without employee records and rejects inactive accounts', () => {
    const customer = actor({ customer: true, branchId: null });
    expect(requireActor(customer)).toBe(customer);
    expect(hasPermission(customer, { module: 'catalog', action: 'read' })).toBe(true);
    expect(() => requireActor(undefined)).toThrow('Account is unavailable');
    expect(hasPermission(actor({ status: 'LOCKED' }), { module: 'catalog', action: 'read' })).toBe(
      false,
    );
  });
});
