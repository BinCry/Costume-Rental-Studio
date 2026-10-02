import {
  AllocationStatus,
  CostumeConditionGrade,
  CrmCaseEventType,
  CrmCasePriority,
  CrmCaseStatus,
  CustomerInteractionType,
  DiscountType,
  InspectionStatus,
  InteractionChannel,
  OrderStatus,
  OutboxStatus,
  PaymentMethod,
  PaymentPurpose,
  PaymentStatus,
  RefundStatus,
  TransferStatus,
  UnitBlockStatus,
  UnitBlockType,
  UnitOperationalStatus,
  UserStatus,
} from '../../src/generated/prisma/client.js';

import type { CoreSeedContext } from './core.js';
import type { SeedDatabase } from './helpers.js';
import { addDays, addHours, seedId, yearsAgo } from './helpers.js';

interface StaffContext {
  inventoryQ1: string;
  inventoryQ3: string;
  salesQ1: string;
  salesQ3: string;
}

interface CatalogContext {
  accessoryByVariantId: Map<string, string>;
  units: { branchId: string; id: string; variantId: string }[];
}

async function seedStaff(
  db: SeedDatabase,
  core: CoreSeedContext,
  anchor: Date,
): Promise<StaffContext> {
  const definitions = [
    {
      sequence: 100,
      email: 'sales.q1@costume.local',
      phone: '+84900000101',
      name: 'Nguyễn Minh Anh',
      employeeCode: 'EMP-SALES-Q1',
      roleId: core.roles.sales,
      branchId: core.branches.district1,
      key: 'salesQ1',
    },
    {
      sequence: 110,
      email: 'sales.q3@costume.local',
      phone: '+84900000102',
      name: 'Trần Hoàng Nam',
      employeeCode: 'EMP-SALES-Q3',
      roleId: core.roles.sales,
      branchId: core.branches.district3,
      key: 'salesQ3',
    },
    {
      sequence: 120,
      email: 'inventory.q1@costume.local',
      phone: '+84900000103',
      name: 'Lê Thanh Tùng',
      employeeCode: 'EMP-INV-Q1',
      roleId: core.roles.inventory,
      branchId: core.branches.district1,
      key: 'inventoryQ1',
    },
    {
      sequence: 130,
      email: 'inventory.q3@costume.local',
      phone: '+84900000104',
      name: 'Phạm Ngọc Lan',
      employeeCode: 'EMP-INV-Q3',
      roleId: core.roles.inventory,
      branchId: core.branches.district3,
      key: 'inventoryQ3',
    },
  ] as const;

  const result = {} as Record<(typeof definitions)[number]['key'], string>;
  for (const definition of definitions) {
    const user = await db.user.upsert({
      where: { email: definition.email },
      update: { displayName: definition.name, status: UserStatus.ACTIVE },
      create: {
        id: seedId(definition.sequence),
        email: definition.email,
        phone: definition.phone,
        displayName: definition.name,
        status: UserStatus.ACTIVE,
      },
    });

    await db.authIdentity.upsert({
      where: {
        provider_providerSubject: {
          provider: 'dev-seed',
          providerSubject: definition.employeeCode.toLowerCase(),
        },
      },
      update: { emailAtLinkTime: definition.email },
      create: {
        id: seedId(definition.sequence + 1),
        userId: user.id,
        provider: 'dev-seed',
        providerSubject: definition.employeeCode.toLowerCase(),
        emailAtLinkTime: definition.email,
      },
    });

    await db.employee.upsert({
      where: { userId: user.id },
      update: {
        employmentStatus: 'ACTIVE',
        terminatedAt: null,
        activatedAt: addDays(anchor, -120),
      },
      create: {
        userId: user.id,
        employeeCode: definition.employeeCode,
        joinedAt: addDays(anchor, -180),
        activatedAt: addDays(anchor, -180),
        createdBy: core.adminUserId,
      },
    });

    await db.userRoleAssignment.upsert({
      where: { id: seedId(definition.sequence + 2) },
      update: {
        userId: user.id,
        roleId: definition.roleId,
        branchId: definition.branchId,
        assignedBy: core.adminUserId,
      },
      create: {
        id: seedId(definition.sequence + 2),
        userId: user.id,
        roleId: definition.roleId,
        branchId: definition.branchId,
        assignedBy: core.adminUserId,
      },
    });

    result[definition.key] = user.id;
  }

  return result;
}

async function seedCustomers(
  db: SeedDatabase,
  core: CoreSeedContext,
  anchor: Date,
): Promise<string[]> {
  const definitions = [
    ['CUST-001', 'customer1@costume.local', '+84910000001', 'Võ Thu Hà', 26, 160, 50, 82, 64, 88],
    [
      'CUST-002',
      'customer2@costume.local',
      '+84910000002',
      'Đặng Quốc Bảo',
      30,
      173,
      68,
      94,
      80,
      96,
    ],
    [
      'CUST-003',
      'customer3@costume.local',
      '+84910000003',
      'Bùi Khánh Linh',
      23,
      165,
      54,
      84,
      66,
      90,
    ],
    [
      'CUST-004',
      'customer4@costume.local',
      '+84910000004',
      'Hoàng Gia Huy',
      34,
      178,
      74,
      99,
      84,
      98,
    ],
    [
      'CUST-005',
      'customer5@costume.local',
      '+84910000005',
      'Ngô Mỹ Duyên',
      28,
      158,
      48,
      80,
      62,
      86,
    ],
  ] as const;
  const customers: string[] = [];

  for (const [index, definition] of definitions.entries()) {
    const [customerCode, email, phone, displayName, age, height, weight, chest, waist, hip] =
      definition;
    const sequence = 200 + index * 5;
    const branchId = index % 2 === 0 ? core.branches.district1 : core.branches.district3;
    const user = await db.user.upsert({
      where: { email },
      update: { displayName, status: UserStatus.ACTIVE },
      create: {
        id: seedId(sequence),
        email,
        phone,
        displayName,
        status: UserStatus.ACTIVE,
      },
    });

    await db.authIdentity.upsert({
      where: {
        provider_providerSubject: {
          provider: 'dev-seed',
          providerSubject: customerCode.toLowerCase(),
        },
      },
      update: { emailAtLinkTime: email },
      create: {
        id: seedId(sequence + 1),
        userId: user.id,
        provider: 'dev-seed',
        providerSubject: customerCode.toLowerCase(),
        emailAtLinkTime: email,
      },
    });

    await db.customer.upsert({
      where: { userId: user.id },
      update: {
        preferredBranchId: branchId,
        birthday: yearsAgo(anchor, age),
        heightCm: height,
        weightKg: weight,
        chestCm: chest,
        waistCm: waist,
        hipCm: hip,
      },
      create: {
        userId: user.id,
        customerCode,
        preferredBranchId: branchId,
        birthday: yearsAgo(anchor, age),
        heightCm: height,
        weightKg: weight,
        chestCm: chest,
        waistCm: waist,
        hipCm: hip,
        internalNote: index === 0 ? 'Khách hàng demo thường thuê trang phục sự kiện.' : null,
      },
    });

    await db.userRoleAssignment.upsert({
      where: { id: seedId(sequence + 2) },
      update: {
        userId: user.id,
        roleId: core.roles.customer,
        branchId: null,
        assignedBy: core.adminUserId,
      },
      create: {
        id: seedId(sequence + 2),
        userId: user.id,
        roleId: core.roles.customer,
        branchId: null,
        assignedBy: core.adminUserId,
      },
    });
    customers.push(user.id);
  }

  return customers;
}

async function seedCatalogAndInventory(
  db: SeedDatabase,
  core: CoreSeedContext,
  staff: StaffContext,
  anchor: Date,
): Promise<CatalogContext> {
  const categoryDefinitions = [
    [300, 'Trang phục truyền thống', null],
    [301, 'Áo dài', 300],
    [302, 'Cổ phục Việt Nam', 300],
    [303, 'Trang phục sự kiện', null],
    [304, 'Dạ hội', 303],
    [305, 'Vest', 303],
    [306, 'Cosplay', null],
  ] as const;
  const categories = new Map<number, string>();

  for (const [sequence, name, parentSequence] of categoryDefinitions) {
    const category = await db.costumeCategory.upsert({
      where: { id: seedId(sequence) },
      update: { name, parentId: parentSequence === null ? null : categories.get(parentSequence) },
      create: {
        id: seedId(sequence),
        name,
        parentId: parentSequence === null ? null : categories.get(parentSequence),
      },
    });
    categories.set(sequence, category.id);
  }

  const modelDefinitions = [
    [400, 'AD-LOTUS', 301, 'Áo dài Sen Việt', 'Lụa', 'Tà áo dài thanh lịch với họa tiết hoa sen.'],
    [410, 'AD-PEARL', 301, 'Áo dài Ngọc Trai', 'Gấm', 'Áo dài gấm dành cho lễ cưới và sự kiện.'],
    [420, 'CP-NHATBINH', 302, 'Nhật Bình Hoàng Gia', 'Gấm thêu', 'Cổ phục Nhật Bình kèm phụ kiện.'],
    [430, 'EV-GALA', 304, 'Đầm Dạ Hội Ánh Sao', 'Satin', 'Đầm dạ hội dáng dài sang trọng.'],
    [
      440,
      'EV-TUXEDO',
      305,
      'Tuxedo Midnight',
      'Wool blend',
      'Tuxedo đen cổ điển cho sự kiện trang trọng.',
    ],
    [450, 'CS-WIZARD', 306, 'Pháp Sư Học Viện', 'Polyester', 'Bộ cosplay pháp sư kèm áo choàng.'],
  ] as const;
  const models: { id: string; sequence: number }[] = [];
  const accessoryByModelId = new Map<string, string>();

  for (const [
    index,
    [sequence, modelCode, categorySequence, name, material, description],
  ] of modelDefinitions.entries()) {
    const categoryId = categories.get(categorySequence);
    if (!categoryId) throw new Error(`Missing category ${categorySequence}`);
    const model = await db.costumeModel.upsert({
      where: { modelCode },
      update: { categoryId, name, material, shortDescription: description },
      create: {
        id: seedId(sequence),
        modelCode,
        categoryId,
        name,
        material,
        shortDescription: description,
        description: `${description} Dữ liệu mẫu dùng trong môi trường phát triển.`,
      },
    });
    models.push({ id: model.id, sequence });

    const accessoryName = index < 2 ? 'Mấn đội đầu' : index === 4 ? 'Nơ cổ' : 'Phụ kiện đi kèm';
    const accessory = await db.costumeModelAccessory.upsert({
      where: { modelId_name: { modelId: model.id, name: accessoryName } },
      update: { defaultQuantity: 1, replacementValueVnd: BigInt(250_000 + index * 50_000) },
      create: {
        id: seedId(470 + index),
        modelId: model.id,
        name: accessoryName,
        defaultQuantity: 1,
        replacementValueVnd: BigInt(250_000 + index * 50_000),
      },
    });
    accessoryByModelId.set(model.id, accessory.id);

    await db.costumeMedia.upsert({
      where: { id: seedId(480 + index) },
      update: {
        modelId: model.id,
        variantId: null,
        objectKey: `seed/catalog/${modelCode.toLowerCase()}.webp`,
        altText: name,
      },
      create: {
        id: seedId(480 + index),
        modelId: model.id,
        objectKey: `seed/catalog/${modelCode.toLowerCase()}.webp`,
        altText: name,
      },
    });
  }

  const variants: { id: string; modelId: string }[] = [];
  const accessoryByVariantId = new Map<string, string>();
  let variantSequence = 500;
  for (const [modelIndex, model] of models.entries()) {
    for (const [variantIndex, sizeCode] of ['M', 'L'].entries()) {
      const variantCode = `${modelDefinitions[modelIndex]?.[1] ?? 'MODEL'}-${sizeCode}`;
      const variant = await db.costumeVariant.upsert({
        where: { variantCode },
        update: {
          modelId: model.id,
          sizeCode,
          colorCode: modelIndex % 2 === 0 ? 'RED' : 'BLACK',
          dailyRentalPriceVnd: BigInt(350_000 + modelIndex * 100_000),
          depositAmountVnd: BigInt(1_000_000 + modelIndex * 250_000),
          replacementValueVnd: BigInt(3_000_000 + modelIndex * 500_000),
          cleaningBufferMinutes: 720,
        },
        create: {
          id: seedId(variantSequence),
          variantCode,
          modelId: model.id,
          sizeCode,
          colorCode: modelIndex % 2 === 0 ? 'RED' : 'BLACK',
          fitNotes: variantIndex === 0 ? 'Form tiêu chuẩn.' : 'Phù hợp dáng người cao.',
          dailyRentalPriceVnd: BigInt(350_000 + modelIndex * 100_000),
          depositAmountVnd: BigInt(1_000_000 + modelIndex * 250_000),
          replacementValueVnd: BigInt(3_000_000 + modelIndex * 500_000),
          cleaningBufferMinutes: 720,
        },
      });
      variants.push({ id: variant.id, modelId: model.id });
      const accessoryId = accessoryByModelId.get(model.id);
      if (accessoryId) accessoryByVariantId.set(variant.id, accessoryId);
      variantSequence += 1;
    }
  }

  const units: { branchId: string; id: string; variantId: string }[] = [];
  let unitIndex = 0;
  for (const variant of variants) {
    for (let copy = 1; copy <= 2; copy += 1) {
      const sequence = 600 + unitIndex;
      let operationalStatus: UnitOperationalStatus = UnitOperationalStatus.READY;
      let conditionGrade: CostumeConditionGrade = CostumeConditionGrade.GOOD;
      let retiredAt: Date | null = null;
      if (unitIndex === 1) {
        operationalStatus = UnitOperationalStatus.INBOUND;
        conditionGrade = CostumeConditionGrade.UNINSPECTED;
      } else if (unitIndex === 2) {
        operationalStatus = UnitOperationalStatus.CLEANING;
      } else if (unitIndex === 3) {
        operationalStatus = UnitOperationalStatus.REPAIR;
        conditionGrade = CostumeConditionGrade.FAIR;
      } else if (unitIndex === 4) {
        operationalStatus = UnitOperationalStatus.RETIRED;
        conditionGrade = CostumeConditionGrade.DAMAGED;
        retiredAt = addDays(anchor, -30);
      } else if (unitIndex === 5) {
        operationalStatus = UnitOperationalStatus.IN_TRANSFER;
      }

      const currentBranchId =
        unitIndex === 5
          ? core.branches.district1
          : unitIndex === 6 || unitIndex % 2 === 1
            ? core.branches.district3
            : core.branches.district1;
      const unitCode = `UNIT-${String(unitIndex + 1).padStart(3, '0')}`;
      const unit = await db.costumeUnit.upsert({
        where: { unitCode },
        update: {
          variantId: variant.id,
          currentBranchId,
          conditionGrade,
          operationalStatus,
          retiredAt,
        },
        create: {
          id: seedId(sequence),
          unitCode,
          variantId: variant.id,
          currentBranchId,
          conditionGrade,
          operationalStatus,
          acquiredAt: addDays(anchor, -240 + unitIndex),
          acquisitionCostVnd: BigInt(2_000_000 + unitIndex * 100_000),
          retiredAt,
        },
      });
      units.push({ branchId: currentBranchId, id: unit.id, variantId: variant.id });

      await db.unitEvent.upsert({
        where: { id: seedId(700 + unitIndex) },
        update: {
          unitId: unit.id,
          eventType: 'REGISTERED',
          toBranchId: currentBranchId,
          recordedBy:
            currentBranchId === core.branches.district1 ? staff.inventoryQ1 : staff.inventoryQ3,
        },
        create: {
          id: seedId(700 + unitIndex),
          unitId: unit.id,
          eventType: 'REGISTERED',
          toBranchId: currentBranchId,
          recordedBy:
            currentBranchId === core.branches.district1 ? staff.inventoryQ1 : staff.inventoryQ3,
          occurredAt: addDays(anchor, -240 + unitIndex),
          notes: 'Unit được tạo bởi demo seed.',
        },
      });
      unitIndex += 1;
    }
  }

  const cleaningUnit = units[2];
  const repairUnit = units[3];
  if (!cleaningUnit || !repairUnit) throw new Error('Not enough seeded units for unit blocks');
  await db.unitBlock.upsert({
    where: { id: seedId(750) },
    update: {
      unitId: cleaningUnit.id,
      status: UnitBlockStatus.IN_PROGRESS,
      blockedFrom: addHours(anchor, -12),
      blockedUntil: addHours(anchor, 12),
      startedAt: addHours(anchor, -12),
    },
    create: {
      id: seedId(750),
      unitId: cleaningUnit.id,
      blockType: UnitBlockType.CLEANING,
      status: UnitBlockStatus.IN_PROGRESS,
      blockedFrom: addHours(anchor, -12),
      blockedUntil: addHours(anchor, 12),
      assignedTo: staff.inventoryQ1,
      costVnd: BigInt(80_000),
      reason: 'Vệ sinh sau đơn thuê demo.',
      startedAt: addHours(anchor, -12),
      createdBy: staff.inventoryQ1,
    },
  });
  await db.unitBlock.upsert({
    where: { id: seedId(751) },
    update: {
      unitId: repairUnit.id,
      status: UnitBlockStatus.COMPLETED,
      blockedFrom: addDays(anchor, -8),
      blockedUntil: addDays(anchor, -6),
      startedAt: addDays(anchor, -8),
      finishedAt: addDays(anchor, -6),
    },
    create: {
      id: seedId(751),
      unitId: repairUnit.id,
      blockType: UnitBlockType.REPAIR,
      status: UnitBlockStatus.COMPLETED,
      blockedFrom: addDays(anchor, -8),
      blockedUntil: addDays(anchor, -6),
      assignedTo: staff.inventoryQ3,
      costVnd: BigInt(250_000),
      reason: 'Thay khóa kéo.',
      startedAt: addDays(anchor, -8),
      finishedAt: addDays(anchor, -6),
      createdBy: staff.inventoryQ3,
    },
  });

  const inTransitUnit = units[5];
  const receivedUnit = units[6];
  if (!inTransitUnit || !receivedUnit) throw new Error('Not enough seeded units for transfers');
  const receivedTransfer = await db.stockTransfer.upsert({
    where: { transferCode: 'TRF-DEMO-RECEIVED' },
    update: {
      status: TransferStatus.RECEIVED,
      approvedAt: addDays(anchor, -12),
      shippedAt: addDays(anchor, -11),
      receivedAt: addDays(anchor, -10),
    },
    create: {
      id: seedId(760),
      transferCode: 'TRF-DEMO-RECEIVED',
      fromBranchId: core.branches.district1,
      toBranchId: core.branches.district3,
      status: TransferStatus.RECEIVED,
      requestNote: 'Bổ sung tồn kho chi nhánh Quận 3.',
      requestedBy: staff.inventoryQ3,
      approvedBy: core.adminUserId,
      approvedAt: addDays(anchor, -12),
      shippedBy: staff.inventoryQ1,
      shippedAt: addDays(anchor, -11),
      receivedBy: staff.inventoryQ3,
      receivedAt: addDays(anchor, -10),
    },
  });
  await db.stockTransferItem.upsert({
    where: { transferId_unitId: { transferId: receivedTransfer.id, unitId: receivedUnit.id } },
    update: {
      conditionOut: CostumeConditionGrade.GOOD,
      conditionIn: CostumeConditionGrade.GOOD,
      receivedOperationalStatus: UnitOperationalStatus.READY,
    },
    create: {
      id: seedId(761),
      transferId: receivedTransfer.id,
      unitId: receivedUnit.id,
      conditionOut: CostumeConditionGrade.GOOD,
      conditionIn: CostumeConditionGrade.GOOD,
      receivedOperationalStatus: UnitOperationalStatus.READY,
    },
  });

  const activeTransfer = await db.stockTransfer.upsert({
    where: { transferCode: 'TRF-DEMO-IN-TRANSIT' },
    update: {
      status: TransferStatus.IN_TRANSIT,
      approvedAt: addDays(anchor, -1),
      shippedAt: addHours(anchor, -8),
      receivedAt: null,
    },
    create: {
      id: seedId(762),
      transferCode: 'TRF-DEMO-IN-TRANSIT',
      fromBranchId: core.branches.district1,
      toBranchId: core.branches.district3,
      status: TransferStatus.IN_TRANSIT,
      requestNote: 'Điều chuyển phục vụ đơn cuối tuần.',
      requestedBy: staff.inventoryQ3,
      approvedBy: core.adminUserId,
      approvedAt: addDays(anchor, -1),
      shippedBy: staff.inventoryQ1,
      shippedAt: addHours(anchor, -8),
    },
  });
  await db.stockTransferItem.upsert({
    where: { transferId_unitId: { transferId: activeTransfer.id, unitId: inTransitUnit.id } },
    update: { conditionOut: CostumeConditionGrade.GOOD },
    create: {
      id: seedId(763),
      transferId: activeTransfer.id,
      unitId: inTransitUnit.id,
      conditionOut: CostumeConditionGrade.GOOD,
    },
  });

  await db.unitEvent.upsert({
    where: { id: seedId(764) },
    update: { unitId: inTransitUnit.id, stockTransferId: activeTransfer.id },
    create: {
      id: seedId(764),
      unitId: inTransitUnit.id,
      stockTransferId: activeTransfer.id,
      eventType: 'TRANSFER_SHIPPED',
      fromBranchId: core.branches.district1,
      toBranchId: core.branches.district3,
      recordedBy: staff.inventoryQ1,
      occurredAt: addHours(anchor, -8),
      notes: 'Unit đang trên đường điều chuyển.',
    },
  });

  return { accessoryByVariantId, units };
}

interface OrderSeedResult {
  byStatus: Map<OrderStatus, { customerUserId: string; id: string; itemId: string }>;
}

async function seedRentals(
  db: SeedDatabase,
  core: CoreSeedContext,
  staff: StaffContext,
  customers: string[],
  catalog: CatalogContext,
  anchor: Date,
): Promise<OrderSeedResult> {
  const percentPromotion = await db.promotion.upsert({
    where: { code: 'WELCOME10' },
    update: {
      startAt: addDays(anchor, -30),
      endAt: addDays(anchor, 60),
      isActive: true,
    },
    create: {
      id: seedId(800),
      code: 'WELCOME10',
      name: 'Chào mừng khách hàng mới',
      discountType: DiscountType.PERCENT,
      discountValue: BigInt(10),
      maxDiscountVnd: BigInt(300_000),
      minOrderAmountVnd: BigInt(500_000),
      startAt: addDays(anchor, -30),
      endAt: addDays(anchor, 60),
      totalUsageLimit: 1_000,
      perCustomerLimit: 1,
      createdBy: core.adminUserId,
    },
  });
  await db.promotion.upsert({
    where: { code: 'EVENT200K' },
    update: { startAt: addDays(anchor, -7), endAt: addDays(anchor, 30), isActive: true },
    create: {
      id: seedId(801),
      code: 'EVENT200K',
      name: 'Ưu đãi mùa sự kiện',
      discountType: DiscountType.FIXED_AMOUNT,
      discountValue: BigInt(200_000),
      minOrderAmountVnd: BigInt(1_000_000),
      startAt: addDays(anchor, -7),
      endAt: addDays(anchor, 30),
      totalUsageLimit: 500,
      perCustomerLimit: 2,
      createdBy: core.adminUserId,
    },
  });

  const definitions = [
    { status: OrderStatus.DRAFT, start: 5, due: 7, allocation: AllocationStatus.UNASSIGNED },
    {
      status: OrderStatus.PENDING_CONFIRMATION,
      start: 4,
      due: 6,
      allocation: AllocationStatus.UNASSIGNED,
    },
    { status: OrderStatus.CONFIRMED, start: 3, due: 5, allocation: AllocationStatus.CONFIRMED },
    { status: OrderStatus.PREPARING, start: 2, due: 4, allocation: AllocationStatus.CONFIRMED },
    {
      status: OrderStatus.READY_FOR_PICKUP,
      start: 1,
      due: 3,
      allocation: AllocationStatus.CONFIRMED,
    },
    { status: OrderStatus.ACTIVE, start: -1, due: 1, allocation: AllocationStatus.ACTIVE },
    {
      status: OrderStatus.RETURN_INSPECTION,
      start: -4,
      due: -2,
      allocation: AllocationStatus.ACTIVE,
    },
    { status: OrderStatus.COMPLETED, start: -20, due: -17, allocation: AllocationStatus.COMPLETED },
    { status: OrderStatus.REJECTED, start: 6, due: 8, allocation: AllocationStatus.UNASSIGNED },
    { status: OrderStatus.CANCELLED, start: 7, due: 9, allocation: AllocationStatus.RELEASED },
    { status: OrderStatus.NO_SHOW, start: -3, due: -1, allocation: AllocationStatus.RELEASED },
  ] as const;
  const byStatus: OrderSeedResult['byStatus'] = new Map();
  const pickedUpStatuses = new Set<OrderStatus>([
    OrderStatus.ACTIVE,
    OrderStatus.RETURN_INSPECTION,
    OrderStatus.COMPLETED,
  ]);
  const returnedStatuses = new Set<OrderStatus>([
    OrderStatus.RETURN_INSPECTION,
    OrderStatus.COMPLETED,
  ]);
  const quotedStatuses = new Set<OrderStatus>([
    OrderStatus.DRAFT,
    OrderStatus.PENDING_CONFIRMATION,
  ]);
  let allocatedUnitIndex = 7;

  for (const [index, definition] of definitions.entries()) {
    const customerUserId = customers[index % customers.length];
    if (!customerUserId) throw new Error('Missing seeded customer');
    const isUnassigned = definition.allocation === AllocationStatus.UNASSIGNED;
    const unit = isUnassigned ? null : catalog.units[allocatedUnitIndex++];
    const branchId =
      unit?.branchId ?? (index % 2 === 0 ? core.branches.district1 : core.branches.district3);
    const branchSalesUserId = branchId === core.branches.district1 ? staff.salesQ1 : staff.salesQ3;
    const creatorId = definition.status === OrderStatus.DRAFT ? customerUserId : branchSalesUserId;
    const plannedStartAt = addDays(anchor, definition.start);
    const plannedDueAt = addDays(anchor, definition.due);
    const isPickedUp = pickedUpStatuses.has(definition.status);
    const isReturned = returnedStatuses.has(definition.status);
    const usesPromotion = definition.status === OrderStatus.CONFIRMED;
    const orderCode = `ORD-DEMO-${String(index + 1).padStart(3, '0')}`;
    const order = await db.rentalOrder.upsert({
      where: { orderCode },
      update: {
        customerUserId,
        pickupBranchId: branchId,
        plannedStartAt,
        plannedDueAt,
        status: definition.status,
        policyVersionId: core.policyId,
        promotionId: usesPromotion ? percentPromotion.id : null,
        promotionCode: usesPromotion ? percentPromotion.code : null,
        promotionDiscountVnd: usesPromotion ? BigInt(100_000) : BigInt(0),
        quoteExpiresAt: quotedStatuses.has(definition.status) ? addHours(anchor, 24) : null,
        createdBy: creatorId,
        pickupProcessedBy: isPickedUp ? branchSalesUserId : null,
        pickedUpAt: isPickedUp ? addHours(plannedStartAt, 1) : null,
        returnProcessedBy: isReturned ? branchSalesUserId : null,
        returnedAt: isReturned ? addHours(plannedDueAt, 2) : null,
        inspectionStatus:
          definition.status === OrderStatus.RETURN_INSPECTION
            ? InspectionStatus.PENDING_ASSESSMENT
            : definition.status === OrderStatus.COMPLETED
              ? InspectionStatus.COMPLETED
              : null,
        financiallySettledAt:
          definition.status === OrderStatus.COMPLETED ? addHours(plannedDueAt, 3) : null,
      },
      create: {
        id: seedId(820 + index),
        orderCode,
        customerUserId,
        pickupBranchId: branchId,
        channel: index % 2 === 0 ? 'ONLINE' : 'IN_STORE',
        plannedStartAt,
        plannedDueAt,
        customerNote: index === 0 ? 'Dữ liệu demo: khách muốn thử đồ trước khi nhận.' : null,
        status: definition.status,
        policyVersionId: core.policyId,
        promotionId: usesPromotion ? percentPromotion.id : null,
        promotionCode: usesPromotion ? percentPromotion.code : null,
        promotionDiscountVnd: usesPromotion ? BigInt(100_000) : BigInt(0),
        quoteExpiresAt: quotedStatuses.has(definition.status) ? addHours(anchor, 24) : null,
        createdBy: creatorId,
        pickupProcessedBy: isPickedUp ? branchSalesUserId : null,
        pickedUpAt: isPickedUp ? addHours(plannedStartAt, 1) : null,
        returnProcessedBy: isReturned ? branchSalesUserId : null,
        returnedAt: isReturned ? addHours(plannedDueAt, 2) : null,
        inspectionStatus:
          definition.status === OrderStatus.RETURN_INSPECTION
            ? InspectionStatus.PENDING_ASSESSMENT
            : definition.status === OrderStatus.COMPLETED
              ? InspectionStatus.COMPLETED
              : null,
        returnNotes:
          definition.status === OrderStatus.COMPLETED ? 'Trang phục trả đủ, tình trạng tốt.' : null,
        financiallySettledAt:
          definition.status === OrderStatus.COMPLETED ? addHours(plannedDueAt, 3) : null,
      },
    });

    const fallbackVariant = catalog.units[index]?.variantId;
    const variantId = unit?.variantId ?? fallbackVariant;
    if (!variantId) throw new Error(`Missing variant for order ${orderCode}`);
    const isCompleted = definition.status === OrderStatus.COMPLETED;
    const itemId = seedId(850 + index);
    const item = await db.rentalOrderItem.upsert({
      where: { id: itemId },
      update: {
        orderId: order.id,
        variantId,
        unitId: unit?.id ?? null,
        allocationStatus: definition.allocation,
        occupiedFrom: plannedStartAt,
        occupiedUntil: addHours(plannedDueAt, 12),
        allocatedBy: isUnassigned ? null : branchSalesUserId,
        billableDays: Math.max(1, definition.due - definition.start),
        unitDailyPriceVnd: BigInt(550_000),
        unitDepositVnd: BigInt(1_500_000),
        pickupConditionGrade: isPickedUp ? CostumeConditionGrade.GOOD : null,
        returnConditionGrade: isCompleted ? CostumeConditionGrade.GOOD : null,
      },
      create: {
        id: itemId,
        orderId: order.id,
        variantId,
        unitId: unit?.id ?? null,
        allocationStatus: definition.allocation,
        occupiedFrom: plannedStartAt,
        occupiedUntil: addHours(plannedDueAt, 12),
        allocatedBy: isUnassigned ? null : branchSalesUserId,
        billableDays: Math.max(1, definition.due - definition.start),
        unitDailyPriceVnd: BigInt(550_000),
        unitDepositVnd: BigInt(1_500_000),
        pickupConditionGrade: isPickedUp ? CostumeConditionGrade.GOOD : null,
        returnConditionGrade: isCompleted ? CostumeConditionGrade.GOOD : null,
      },
    });

    if (unit) {
      const accessoryId = catalog.accessoryByVariantId.get(variantId);
      if (accessoryId) {
        await db.rentalItemAccessory.upsert({
          where: { id: seedId(880 + index) },
          update: {
            orderItemId: item.id,
            modelAccessoryId: accessoryId,
            quantityOut: 1,
            quantityReturned: isCompleted ? 1 : null,
            conditionOut: isPickedUp ? CostumeConditionGrade.GOOD : null,
            conditionIn: isCompleted ? CostumeConditionGrade.GOOD : null,
            unitReplacementValueVnd: BigInt(300_000),
          },
          create: {
            id: seedId(880 + index),
            orderItemId: item.id,
            modelAccessoryId: accessoryId,
            accessoryName: 'Phụ kiện đi kèm',
            quantityOut: 1,
            quantityReturned: isCompleted ? 1 : null,
            conditionOut: isPickedUp ? CostumeConditionGrade.GOOD : null,
            conditionIn: isCompleted ? CostumeConditionGrade.GOOD : null,
            unitReplacementValueVnd: BigInt(300_000),
          },
        });
      }
    }
    byStatus.set(definition.status, { customerUserId, id: order.id, itemId: item.id });
  }

  return { byStatus };
}

async function seedFinanceAndCrm(
  db: SeedDatabase,
  core: CoreSeedContext,
  staff: StaffContext,
  customers: string[],
  orders: OrderSeedResult,
  anchor: Date,
): Promise<void> {
  const completedOrder = orders.byStatus.get(OrderStatus.COMPLETED);
  const activeOrder = orders.byStatus.get(OrderStatus.ACTIVE);
  const pendingOrder = orders.byStatus.get(OrderStatus.PENDING_CONFIRMATION);
  const cancelledOrder = orders.byStatus.get(OrderStatus.CANCELLED);
  if (!completedOrder || !activeOrder || !pendingOrder || !cancelledOrder) {
    throw new Error('Required demo orders were not seeded');
  }

  const rentalPayment = await db.payment.upsert({
    where: { idempotencyKey: 'seed-payment-rental-completed' },
    update: {
      orderId: completedOrder.id,
      amountVnd: BigInt(1_650_000),
      status: PaymentStatus.SUCCEEDED,
      paidAt: addDays(anchor, -20),
      recordedBy: staff.salesQ1,
    },
    create: {
      id: seedId(900),
      orderId: completedOrder.id,
      purpose: PaymentPurpose.RENTAL,
      method: PaymentMethod.CASH,
      amountVnd: BigInt(1_650_000),
      status: PaymentStatus.SUCCEEDED,
      idempotencyKey: 'seed-payment-rental-completed',
      recordedBy: staff.salesQ1,
      paidAt: addDays(anchor, -20),
    },
  });
  const depositPayment = await db.payment.upsert({
    where: { idempotencyKey: 'seed-payment-deposit-completed' },
    update: {
      orderId: completedOrder.id,
      amountVnd: BigInt(1_500_000),
      status: PaymentStatus.SUCCEEDED,
      paidAt: addDays(anchor, -20),
      recordedBy: staff.salesQ1,
    },
    create: {
      id: seedId(901),
      orderId: completedOrder.id,
      purpose: PaymentPurpose.DEPOSIT,
      method: PaymentMethod.BANK_TRANSFER,
      amountVnd: BigInt(1_500_000),
      status: PaymentStatus.SUCCEEDED,
      idempotencyKey: 'seed-payment-deposit-completed',
      recordedBy: staff.salesQ1,
      paidAt: addDays(anchor, -20),
    },
  });
  const gatewayPayment = await db.payment.upsert({
    where: { idempotencyKey: 'seed-payment-gateway-active' },
    update: {
      orderId: activeOrder.id,
      amountVnd: BigInt(1_100_000),
      status: PaymentStatus.SUCCEEDED,
      paidAt: addDays(anchor, -1),
    },
    create: {
      id: seedId(902),
      orderId: activeOrder.id,
      purpose: PaymentPurpose.RENTAL,
      method: PaymentMethod.PAYMENT_GATEWAY,
      amountVnd: BigInt(1_100_000),
      status: PaymentStatus.SUCCEEDED,
      provider: 'seedpay',
      providerPaymentId: 'seedpay-active-001',
      idempotencyKey: 'seed-payment-gateway-active',
      paidAt: addDays(anchor, -1),
    },
  });
  await db.payment.upsert({
    where: { idempotencyKey: 'seed-payment-pending' },
    update: { orderId: pendingOrder.id, status: PaymentStatus.PENDING, paidAt: null },
    create: {
      id: seedId(903),
      orderId: pendingOrder.id,
      purpose: PaymentPurpose.DEPOSIT,
      method: PaymentMethod.PAYMENT_GATEWAY,
      amountVnd: BigInt(1_500_000),
      status: PaymentStatus.PENDING,
      provider: 'seedpay',
      providerPaymentId: 'seedpay-pending-001',
      idempotencyKey: 'seed-payment-pending',
    },
  });
  await db.payment.upsert({
    where: { idempotencyKey: 'seed-payment-failed' },
    update: {
      orderId: cancelledOrder.id,
      status: PaymentStatus.FAILED,
      paidAt: null,
      failureReason: 'Giao dịch demo bị từ chối.',
    },
    create: {
      id: seedId(904),
      orderId: cancelledOrder.id,
      purpose: PaymentPurpose.RENTAL,
      method: PaymentMethod.PAYMENT_GATEWAY,
      amountVnd: BigInt(1_100_000),
      status: PaymentStatus.FAILED,
      provider: 'seedpay',
      providerPaymentId: 'seedpay-failed-001',
      idempotencyKey: 'seed-payment-failed',
      failureReason: 'Giao dịch demo bị từ chối.',
    },
  });

  const requester = completedOrder.customerUserId;
  await db.refund.upsert({
    where: { providerRefundId: 'seed-refund-001' },
    update: {
      paymentId: depositPayment.id,
      amountVnd: BigInt(1_500_000),
      status: RefundStatus.COMPLETED,
      requestedBy: requester,
      approvedBy: core.adminUserId,
      completedAt: addDays(anchor, -16),
    },
    create: {
      id: seedId(910),
      paymentId: depositPayment.id,
      amountVnd: BigInt(1_500_000),
      reason: 'Hoàn cọc sau khi kiểm tra trang phục.',
      status: RefundStatus.COMPLETED,
      requestedBy: requester,
      approvedBy: core.adminUserId,
      providerRefundId: 'seed-refund-001',
      completedAt: addDays(anchor, -16),
    },
  });

  await db.providerWebhookEvent.upsert({
    where: { provider_eventId: { provider: 'seedpay', eventId: 'evt-seed-active-001' } },
    update: {
      paymentId: gatewayPayment.id,
      processingStatus: 'PROCESSED',
      processedAt: addDays(anchor, -1),
    },
    create: {
      id: seedId(920),
      paymentId: gatewayPayment.id,
      provider: 'seedpay',
      eventId: 'evt-seed-active-001',
      eventType: 'payment.succeeded',
      payloadJson: { source: 'demo-seed', paymentId: gatewayPayment.id },
      receivedAt: addDays(anchor, -1),
      processedAt: addDays(anchor, -1),
      processingStatus: 'PROCESSED',
    },
  });

  const caseDefinitions = [
    {
      sequence: 930,
      code: 'CASE-DEMO-OPEN',
      customer: customers[0],
      order: activeOrder.id,
      subject: 'Hỏi cách bảo quản trang phục',
      type: 'SUPPORT',
      priority: CrmCasePriority.NORMAL,
      status: CrmCaseStatus.OPEN,
      owner: staff.salesQ1,
    },
    {
      sequence: 931,
      code: 'CASE-DEMO-PROGRESS',
      customer: customers[1],
      order: pendingOrder.id,
      subject: 'Yêu cầu đổi kích thước',
      type: 'ORDER_CHANGE',
      priority: CrmCasePriority.HIGH,
      status: CrmCaseStatus.IN_PROGRESS,
      owner: staff.salesQ3,
    },
    {
      sequence: 932,
      code: 'CASE-DEMO-RESOLVED',
      customer: customers[2],
      order: completedOrder.id,
      subject: 'Đối soát hoàn tiền cọc',
      type: 'PAYMENT',
      priority: CrmCasePriority.NORMAL,
      status: CrmCaseStatus.RESOLVED,
      owner: staff.salesQ1,
    },
  ] as const;

  for (const [index, definition] of caseDefinitions.entries()) {
    if (!definition.customer) throw new Error('Missing CRM customer');
    const resolvedAt = definition.status === CrmCaseStatus.RESOLVED ? addDays(anchor, -2) : null;
    const crmCase = await db.crmCase.upsert({
      where: { caseCode: definition.code },
      update: {
        customerUserId: definition.customer,
        orderId: definition.order,
        subject: definition.subject,
        priority: definition.priority,
        status: definition.status,
        ownerUserId: definition.owner,
        resolvedAt,
      },
      create: {
        id: seedId(definition.sequence),
        caseCode: definition.code,
        customerUserId: definition.customer,
        orderId: definition.order,
        branchId: index === 1 ? core.branches.district3 : core.branches.district1,
        subject: definition.subject,
        description: 'CRM case được tạo bởi demo seed.',
        caseType: definition.type,
        priority: definition.priority,
        status: definition.status,
        ownerUserId: definition.owner,
        dueAt: addDays(anchor, index + 2),
        resolvedAt,
        createdBy: staff.salesQ1,
      },
    });

    await db.crmCaseHistory.upsert({
      where: { id: seedId(940 + index * 2) },
      update: {
        caseId: crmCase.id,
        eventType: CrmCaseEventType.CREATED,
        fromStatus: null,
        toStatus: CrmCaseStatus.OPEN,
      },
      create: {
        id: seedId(940 + index * 2),
        caseId: crmCase.id,
        eventType: CrmCaseEventType.CREATED,
        toStatus: CrmCaseStatus.OPEN,
        toOwnerUserId: definition.owner,
        actorUserId: staff.salesQ1,
        note: 'Tạo case demo.',
        occurredAt: addDays(anchor, -5 + index),
      },
    });
    if (definition.status !== CrmCaseStatus.OPEN) {
      await db.crmCaseHistory.upsert({
        where: { id: seedId(941 + index * 2) },
        update: {
          caseId: crmCase.id,
          eventType: CrmCaseEventType.STATUS_CHANGED,
          fromStatus: CrmCaseStatus.OPEN,
          toStatus: definition.status,
        },
        create: {
          id: seedId(941 + index * 2),
          caseId: crmCase.id,
          eventType: CrmCaseEventType.STATUS_CHANGED,
          fromStatus: CrmCaseStatus.OPEN,
          toStatus: definition.status,
          actorUserId: definition.owner,
          note: 'Cập nhật trạng thái case demo.',
          occurredAt: addDays(anchor, -3 + index),
        },
      });
    }

    await db.customerInteraction.upsert({
      where: { id: seedId(950 + index) },
      update: {
        customerUserId: definition.customer,
        orderId: definition.order,
        caseId: crmCase.id,
        staffUserId: definition.owner,
        summary: definition.subject,
      },
      create: {
        id: seedId(950 + index),
        customerUserId: definition.customer,
        branchId: index === 1 ? core.branches.district3 : core.branches.district1,
        orderId: definition.order,
        caseId: crmCase.id,
        staffUserId: definition.owner,
        interactionType:
          index === 0
            ? CustomerInteractionType.INQUIRY
            : index === 1
              ? CustomerInteractionType.CONSULTATION
              : CustomerInteractionType.FOLLOW_UP,
        channel: index === 0 ? InteractionChannel.CHAT : InteractionChannel.PHONE,
        summary: definition.subject,
        occurredAt: addDays(anchor, -4 + index),
      },
    });
  }

  await db.auditLog.upsert({
    where: { id: seedId(970) },
    update: {
      actorUserId: core.adminUserId,
      actionCode: 'seed.completed',
      afterJson: { profile: 'demo', status: 'completed' },
    },
    create: {
      id: seedId(970),
      actorUserId: core.adminUserId,
      actionCode: 'seed.completed',
      entityType: 'database',
      afterJson: { profile: 'demo', status: 'completed' },
      occurredAt: anchor,
    },
  });
  await db.outboxEvent.upsert({
    where: { id: seedId(971) },
    update: {
      aggregateId: rentalPayment.id,
      status: OutboxStatus.PROCESSED,
      processedAt: anchor,
    },
    create: {
      id: seedId(971),
      eventType: 'payment.succeeded.demo',
      aggregateType: 'payment',
      aggregateId: rentalPayment.id,
      payloadJson: { paymentId: rentalPayment.id, source: 'demo-seed' },
      status: OutboxStatus.PROCESSED,
      availableAt: anchor,
      processedAt: anchor,
    },
  });
}

export async function seedDemo(
  db: SeedDatabase,
  core: CoreSeedContext,
  anchor: Date,
): Promise<void> {
  const staff = await seedStaff(db, core, anchor);
  const customers = await seedCustomers(db, core, anchor);
  const catalog = await seedCatalogAndInventory(db, core, staff, anchor);
  const orders = await seedRentals(db, core, staff, customers, catalog, anchor);
  await seedFinanceAndCrm(db, core, staff, customers, orders, anchor);
}
