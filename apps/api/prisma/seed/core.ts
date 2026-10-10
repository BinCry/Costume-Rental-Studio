import {
  ActorGroup,
  BillingDayMode,
  PermissionScope,
  UserStatus,
} from '../../src/generated/prisma/client.js';

import type { SeedDatabase } from './helpers.js';
import { seedId } from './helpers.js';

const permissionDefinitions = [
  ['branches.manage.all', 'branches', 'manage', PermissionScope.ALL],
  ['branches.read.all', 'branches', 'read', PermissionScope.ALL],
  ['staff.manage.all', 'staff', 'manage', PermissionScope.ALL],
  ['staff.read.all', 'staff', 'read', PermissionScope.ALL],
  ['rbac.manage.all', 'rbac', 'manage', PermissionScope.ALL],
  ['rbac.read.all', 'rbac', 'read', PermissionScope.ALL],
  ['catalog.manage.all', 'catalog', 'manage', PermissionScope.ALL],
  ['catalog.read.all', 'catalog', 'read', PermissionScope.ALL],
  ['inventory.read.branch', 'inventory', 'read', PermissionScope.BRANCH],
  ['inventory.manage.branch', 'inventory', 'manage', PermissionScope.BRANCH],
  ['inventory.read.all', 'inventory', 'read', PermissionScope.ALL],
  ['inventory.manage.all', 'inventory', 'manage', PermissionScope.ALL],
  ['transfers.manage.branch', 'transfers', 'manage', PermissionScope.BRANCH],
  ['transfers.read.branch', 'transfers', 'read', PermissionScope.BRANCH],
  ['transfers.read.all', 'transfers', 'read', PermissionScope.ALL],
  ['transfers.manage.all', 'transfers', 'manage', PermissionScope.ALL],
  ['rentals.read.own', 'rentals', 'read', PermissionScope.OWN],
  ['rentals.manage.own', 'rentals', 'manage', PermissionScope.OWN],
  ['rentals.read.branch', 'rentals', 'read', PermissionScope.BRANCH],
  ['rentals.manage.branch', 'rentals', 'manage', PermissionScope.BRANCH],
  ['rentals.read.all', 'rentals', 'read', PermissionScope.ALL],
  ['rentals.manage.all', 'rentals', 'manage', PermissionScope.ALL],
  ['payments.read.branch', 'payments', 'read', PermissionScope.BRANCH],
  ['payments.manage.branch', 'payments', 'manage', PermissionScope.BRANCH],
  ['crm.read.branch', 'crm', 'read', PermissionScope.BRANCH],
  ['crm.manage.branch', 'crm', 'manage', PermissionScope.BRANCH],
  ['reports.read.branch', 'reports', 'read', PermissionScope.BRANCH],
  ['reports.read.all', 'reports', 'read', PermissionScope.ALL],
  ['customers.create.all', 'customers', 'create', PermissionScope.ALL],
  ['customers.create.branch', 'customers', 'create', PermissionScope.BRANCH],
  ['customers.read.all', 'customers', 'read', PermissionScope.ALL],
  ['customers.read.branch', 'customers', 'read', PermissionScope.BRANCH],
  ['customers.update.all', 'customers', 'update', PermissionScope.ALL],
  ['customers.update.branch', 'customers', 'update', PermissionScope.BRANCH],
  ['promotions.read.all', 'promotions', 'read', PermissionScope.ALL],
  ['promotions.manage.all', 'promotions', 'manage', PermissionScope.ALL],
  ['policies.read.all', 'policies', 'read', PermissionScope.ALL],
  ['policies.manage.all', 'policies', 'manage', PermissionScope.ALL],
] as const;

export interface CoreSeedContext {
  adminUserId: string;
  branches: {
    district1: string;
    district3: string;
  };
  policyId: string;
  roles: {
    admin: string;
    customer: string;
    inventory: string;
    sales: string;
  };
}

export async function seedCore(db: SeedDatabase): Promise<CoreSeedContext> {
  const district1 = await db.branch.upsert({
    where: { branchCode: 'HCM-Q1' },
    update: {
      name: 'Costume Studio Quận 1',
      address: '123 Nguyễn Huệ, Phường Sài Gòn, TP.HCM',
      phone: '+842873001001',
      status: 'ACTIVE',
    },
    create: {
      id: seedId(1),
      branchCode: 'HCM-Q1',
      name: 'Costume Studio Quận 1',
      address: '123 Nguyễn Huệ, Phường Sài Gòn, TP.HCM',
      phone: '+842873001001',
      status: 'ACTIVE',
    },
  });

  const district3 = await db.branch.upsert({
    where: { branchCode: 'HCM-Q3' },
    update: {
      name: 'Costume Studio Quận 3',
      address: '45 Võ Văn Tần, Phường Bàn Cờ, TP.HCM',
      phone: '+842873003003',
      status: 'ACTIVE',
    },
    create: {
      id: seedId(2),
      branchCode: 'HCM-Q3',
      name: 'Costume Studio Quận 3',
      address: '45 Võ Văn Tần, Phường Bàn Cờ, TP.HCM',
      phone: '+842873003003',
      status: 'ACTIVE',
    },
  });

  const admin = await db.user.upsert({
    where: { email: 'admin@costume.local' },
    update: { displayName: 'Quản trị hệ thống', status: UserStatus.ACTIVE },
    create: {
      id: seedId(10),
      email: 'admin@costume.local',
      phone: '+84900000001',
      displayName: 'Quản trị hệ thống',
      status: UserStatus.ACTIVE,
    },
  });

  await db.authIdentity.upsert({
    where: {
      provider_providerSubject: {
        provider: 'dev-seed',
        providerSubject: 'admin',
      },
    },
    update: { emailAtLinkTime: admin.email ?? 'admin@costume.local' },
    create: {
      id: seedId(11),
      userId: admin.id,
      provider: 'dev-seed',
      providerSubject: 'admin',
      emailAtLinkTime: admin.email ?? 'admin@costume.local',
    },
  });

  await db.employee.upsert({
    where: { userId: admin.id },
    update: {
      employmentStatus: 'ACTIVE',
      terminatedAt: null,
      activatedAt: new Date('2025-01-01T00:00:00.000Z'),
    },
    create: {
      userId: admin.id,
      employeeCode: 'EMP-ADMIN-001',
      joinedAt: new Date('2025-01-01T00:00:00.000Z'),
      activatedAt: new Date('2025-01-01T00:00:00.000Z'),
      createdBy: admin.id,
    },
  });

  const roleDefinitions = [
    ['ADMIN', 'Quản trị viên', ActorGroup.ADMIN],
    ['SALES_STAFF', 'Nhân viên bán hàng', ActorGroup.STAFF],
    ['INVENTORY_STAFF', 'Nhân viên kho', ActorGroup.STAFF],
    ['CUSTOMER', 'Khách hàng', ActorGroup.CUSTOMER],
  ] as const;
  const roles = new Map<string, string>();

  for (const [index, [roleCode, name, actorGroup]] of roleDefinitions.entries()) {
    const role = await db.role.upsert({
      where: { roleCode },
      update: { name, actorGroup, isActive: true },
      create: {
        id: seedId(20 + index),
        roleCode,
        name,
        actorGroup,
        isActive: true,
      },
    });
    roles.set(roleCode, role.id);
  }

  const permissions = new Map<string, string>();
  for (const [code, module, action, scope] of permissionDefinitions) {
    const permission = await db.permission.upsert({
      where: { code },
      update: { module, action, scope },
      create: {
        code,
        module,
        action,
        scope,
        description: `Cho phép ${action} ${module} trong phạm vi ${scope.toLowerCase()}`,
      },
    });
    permissions.set(code, permission.id);
  }

  const rolePermissionCodes: Record<string, readonly string[]> = {
    ADMIN: permissionDefinitions.map(([code]) => code),
    SALES_STAFF: [
      'customers.create.branch',
      'customers.read.branch',
      'customers.update.branch',
      'catalog.read.all',
      'inventory.read.branch',
      'rentals.read.branch',
      'rentals.manage.branch',
      'payments.read.branch',
      'payments.manage.branch',
      'crm.read.branch',
      'crm.manage.branch',
      'reports.read.branch',
    ],
    INVENTORY_STAFF: [
      'catalog.read.all',
      'inventory.read.branch',
      'inventory.manage.branch',
      'transfers.read.branch',
      'transfers.manage.branch',
      'rentals.read.branch',
    ],
    CUSTOMER: ['catalog.read.all', 'rentals.read.own', 'rentals.manage.own'],
  };

  for (const [roleCode, codes] of Object.entries(rolePermissionCodes)) {
    const roleId = roles.get(roleCode);
    if (!roleId) throw new Error(`Missing seeded role: ${roleCode}`);

    for (const code of codes) {
      const permissionId = permissions.get(code);
      if (!permissionId) throw new Error(`Missing seeded permission: ${code}`);
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId } },
        update: {},
        create: { roleId, permissionId },
      });
    }
  }

  const adminRoleId = roles.get('ADMIN');
  const salesRoleId = roles.get('SALES_STAFF');
  const inventoryRoleId = roles.get('INVENTORY_STAFF');
  const customerRoleId = roles.get('CUSTOMER');
  if (!adminRoleId || !salesRoleId || !inventoryRoleId || !customerRoleId) {
    throw new Error('Core roles were not seeded correctly');
  }

  await db.userRoleAssignment.upsert({
    where: { id: seedId(70) },
    update: { userId: admin.id, roleId: adminRoleId, branchId: null, assignedBy: admin.id },
    create: {
      id: seedId(70),
      userId: admin.id,
      roleId: adminRoleId,
      branchId: null,
      assignedBy: admin.id,
    },
  });

  await db.rentalPolicyVersion.upsert({
    where: { versionCode: 'POLICY-2024' },
    update: {},
    create: {
      id: seedId(80),
      versionCode: 'POLICY-2024',
      effectiveFrom: new Date('2024-01-01T00:00:00.000Z'),
      effectiveTo: new Date('2025-01-01T00:00:00.000Z'),
      billingDayMode: BillingDayMode.CALENDAR_DAY,
      minRentalDays: 1,
      maxRentalDays: 14,
      quoteValidHours: 24,
      noShowGraceMinutes: 120,
      lateGraceMinutes: 60,
      lateFeePercentPerDay: 20,
      freeCancelBeforeHours: 48,
      lateCancelFeePercent: 30,
      refundSlaBusinessDays: 5,
      createdBy: admin.id,
      changeReason: 'Phiên bản chính sách lịch sử phục vụ dữ liệu demo.',
    },
  });

  const currentPolicy = await db.rentalPolicyVersion.upsert({
    where: { versionCode: 'POLICY-2025' },
    update: {
      billingDayMode: BillingDayMode.ROLLING_24_HOURS,
      minRentalDays: 1,
      maxRentalDays: 14,
      quoteValidHours: 24,
      noShowGraceMinutes: 120,
      lateGraceMinutes: 60,
      lateFeePercentPerDay: 20,
      freeCancelBeforeHours: 48,
      lateCancelFeePercent: 30,
      refundSlaBusinessDays: 5,
    },
    create: {
      id: seedId(81),
      versionCode: 'POLICY-2025',
      effectiveFrom: new Date('2025-01-01T00:00:00.000Z'),
      effectiveTo: null,
      billingDayMode: BillingDayMode.ROLLING_24_HOURS,
      minRentalDays: 1,
      maxRentalDays: 14,
      quoteValidHours: 24,
      noShowGraceMinutes: 120,
      lateGraceMinutes: 60,
      lateFeePercentPerDay: 20,
      freeCancelBeforeHours: 48,
      lateCancelFeePercent: 30,
      refundSlaBusinessDays: 5,
      createdBy: admin.id,
      changeReason: 'Chính sách mặc định hiện hành cho toàn hệ thống.',
    },
  });

  return {
    adminUserId: admin.id,
    branches: { district1: district1.id, district3: district3.id },
    policyId: currentPolicy.id,
    roles: {
      admin: adminRoleId,
      sales: salesRoleId,
      inventory: inventoryRoleId,
      customer: customerRoleId,
    },
  };
}
