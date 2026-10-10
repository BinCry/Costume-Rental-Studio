import { randomUUID } from 'node:crypto';

import { AppError } from '../../common/errors/app-error.js';
import { pageResult, pagination } from '../../common/http/query.js';
import { prisma } from '../../database/prisma.js';
import type { CrmCaseStatus, Prisma } from '../../generated/prisma/client.js';
import { hasPermission, requireActor, type AuthenticatedActor } from '../auth/authorization.js';
import { lockActiveBranch } from '../branches/branch.service.js';
import type {
  AssignCaseInput,
  ChangeCaseStatusInput,
  CreateCaseInput,
  CreateInteractionInput,
  InteractionListInput,
  ListCasesInput,
  UpdateCaseInput,
} from './crm.schema.js';

const transactionOptions = { maxWait: 10_000, timeout: 20_000 } as const;

const caseInclude = {
  customer: {
    include: { user: { select: { id: true, displayName: true, email: true, phone: true } } },
  },
  branch: { select: { id: true, branchCode: true, name: true } },
  order: { select: { id: true, orderCode: true, status: true } },
  owner: { include: { user: { select: { id: true, displayName: true } } } },
  creator: { include: { user: { select: { id: true, displayName: true } } } },
} satisfies Prisma.CrmCaseInclude;

function requireEmployee(actor: AuthenticatedActor) {
  requireActor(actor);
  if (!actor.employee)
    throw new AppError(403, 'EMPLOYEE_REQUIRED', 'An active employee account is required');
  return actor;
}
function assertBranchPermission(
  actor: AuthenticatedActor,
  action: 'read' | 'manage',
  branchId: string,
) {
  requireEmployee(actor);
  if (!hasPermission(actor, { module: 'crm', action, branchId }))
    throw new AppError(403, 'FORBIDDEN', `Permission denied for this CRM case`);
}
function accessibleBranches(actor: AuthenticatedActor, action: 'read' | 'manage') {
  requireEmployee(actor);
  if (hasPermission(actor, { module: 'crm', action })) return undefined;
  const branchIds = actor.roleAssignments
    .filter(
      (assignment) =>
        assignment.branchId &&
        assignment.branch?.status === 'ACTIVE' &&
        assignment.role.isActive &&
        assignment.role.rolePermissions.some(
          ({ permission }) =>
            permission.module === 'crm' &&
            permission.action === action &&
            permission.scope === 'BRANCH',
        ),
    )
    .map((assignment) => assignment.branchId!);
  if (!branchIds.length) throw new AppError(403, 'FORBIDDEN', 'CRM permission is required');
  return [...new Set(branchIds)];
}

export async function listAssignees(actor: AuthenticatedActor, branchId: string) {
  requireEmployee(actor);
  if (
    !hasPermission(actor, { module: 'crm', action: 'read', branchId }) &&
    !hasPermission(actor, { module: 'crm', action: 'manage', branchId })
  )
    throw new AppError(403, 'FORBIDDEN', 'CRM permission is required for this branch');

  const users = await prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      employee: { employmentStatus: 'ACTIVE' },
      roleAssignments: { some: { branchId, role: { isActive: true } } },
    },
    select: {
      id: true,
      displayName: true,
      employee: { select: { employeeCode: true } },
    },
    orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
    take: 100,
  });

  return users.map((user) => ({
    userId: user.id,
    employeeCode: user.employee?.employeeCode ?? user.id,
    displayName: user.displayName,
  }));
}

function caseCode() {
  return `CASE-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
}
function caseWhere(query: ListCasesInput, allowedBranches?: string[]): Prisma.CrmCaseWhereInput {
  const conditions: Prisma.CrmCaseWhereInput[] = [
    ...(query.status ? [{ status: query.status }] : []),
    ...(query.overdue
      ? [
          {
            dueAt: { lt: new Date() },
            status: { in: ['OPEN', 'IN_PROGRESS'] as CrmCaseStatus[] },
          },
        ]
      : []),
  ];
  return {
    ...(conditions.length ? { AND: conditions } : {}),
    ...(allowedBranches ? { branchId: { in: allowedBranches } } : {}),
    ...(query.branchId ? { branchId: query.branchId } : {}),
    ...(query.customerUserId ? { customerUserId: query.customerUserId } : {}),
    ...(query.orderId ? { orderId: query.orderId } : {}),
    ...(query.ownerUserId ? { ownerUserId: query.ownerUserId } : {}),
    ...(query.priority ? { priority: query.priority } : {}),
    ...(query.caseType ? { caseType: query.caseType } : {}),
    ...(query.search
      ? {
          OR: [
            { caseCode: { contains: query.search, mode: 'insensitive' } },
            { subject: { contains: query.search, mode: 'insensitive' } },
            {
              customer: { user: { displayName: { contains: query.search, mode: 'insensitive' } } },
            },
          ],
        }
      : {}),
  };
}
async function lockCase(tx: Prisma.TransactionClient, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM crm_cases WHERE id = ${id}::uuid FOR UPDATE
  `;
  if (!rows.length) throw new AppError(404, 'CRM_CASE_NOT_FOUND', 'CRM case not found');
  return tx.crmCase.findUniqueOrThrow({ where: { id }, include: caseInclude });
}
async function assertCustomer(tx: Prisma.TransactionClient, customerUserId: string) {
  const customer = await tx.customer.findUnique({
    where: { userId: customerUserId },
    include: { user: { select: { status: true } } },
  });
  if (customer?.user.status !== 'ACTIVE')
    throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Active customer not found');
}
async function assertOrder(
  tx: Prisma.TransactionClient,
  orderId: string | undefined,
  customerUserId: string,
  branchId: string,
) {
  if (!orderId) return;
  const order = await tx.rentalOrder.findUnique({
    where: { id: orderId },
    select: { customerUserId: true, pickupBranchId: true },
  });
  if (!order) throw new AppError(404, 'RENTAL_ORDER_NOT_FOUND', 'Rental order not found');
  if (order.customerUserId !== customerUserId || order.pickupBranchId !== branchId)
    throw new AppError(
      400,
      'CRM_RELATION_MISMATCH',
      'Order must belong to the same customer and branch',
    );
}
async function assertOwner(
  tx: Prisma.TransactionClient,
  ownerUserId: string | null | undefined,
  branchId: string,
) {
  if (!ownerUserId) return;
  const owner = await tx.user.findUnique({
    where: { id: ownerUserId },
    include: { employee: true, roleAssignments: { where: { branchId, role: { isActive: true } } } },
  });
  if (
    owner?.status !== 'ACTIVE' ||
    owner.employee?.employmentStatus !== 'ACTIVE' ||
    !owner.roleAssignments.length
  )
    throw new AppError(
      400,
      'INVALID_CASE_OWNER',
      'Case owner must be an active employee assigned to this branch',
    );
}
function assertTransition(from: CrmCaseStatus, to: CrmCaseStatus) {
  const allowed: Record<CrmCaseStatus, readonly CrmCaseStatus[]> = {
    OPEN: ['IN_PROGRESS', 'RESOLVED'],
    IN_PROGRESS: ['OPEN', 'RESOLVED'],
    RESOLVED: ['IN_PROGRESS', 'CLOSED'],
    CLOSED: ['IN_PROGRESS'],
  };
  if (!allowed[from].includes(to))
    throw new AppError(409, 'INVALID_CRM_CASE_TRANSITION', 'Case status transition is not allowed');
}

export async function listCases(actor: AuthenticatedActor, query: ListCasesInput) {
  const allowedBranches = accessibleBranches(actor, 'read');
  if (query.branchId) assertBranchPermission(actor, 'read', query.branchId);
  const where = caseWhere(query, allowedBranches);
  const orderBy: Prisma.CrmCaseOrderByWithRelationInput = { [query.sortBy]: query.sortOrder };
  const [items, totalItems] = await prisma.$transaction([
    prisma.crmCase.findMany({
      where,
      include: caseInclude,
      orderBy: [orderBy, { id: 'asc' }],
      ...pagination(query),
    }),
    prisma.crmCase.count({ where }),
  ]);
  return pageResult(items, totalItems, query);
}

export async function getCase(actor: AuthenticatedActor, id: string) {
  requireEmployee(actor);
  const crmCase = await prisma.crmCase.findUnique({ where: { id }, include: caseInclude });
  if (!crmCase) throw new AppError(404, 'CRM_CASE_NOT_FOUND', 'CRM case not found');
  assertBranchPermission(actor, 'read', crmCase.branchId);
  return crmCase;
}

export async function createCase(actor: AuthenticatedActor, input: CreateCaseInput) {
  assertBranchPermission(actor, 'manage', input.branchId);
  return prisma.$transaction(async (tx) => {
    await lockActiveBranch(tx, input.branchId);
    await assertCustomer(tx, input.customerUserId);
    await assertOrder(tx, input.orderId, input.customerUserId, input.branchId);
    await assertOwner(tx, input.ownerUserId, input.branchId);
    const crmCase = await tx.crmCase.create({
      data: {
        caseCode: caseCode(),
        customerUserId: input.customerUserId,
        branchId: input.branchId,
        orderId: input.orderId,
        subject: input.subject,
        description: input.description,
        caseType: input.caseType,
        priority: input.priority,
        ownerUserId: input.ownerUserId,
        dueAt: input.dueAt,
        createdBy: actor.id,
      },
      include: caseInclude,
    });
    await tx.crmCaseHistory.create({
      data: {
        caseId: crmCase.id,
        eventType: 'CREATED',
        toStatus: 'OPEN',
        toOwnerUserId: input.ownerUserId,
        actorUserId: actor.id,
        note: input.note,
      },
    });
    return crmCase;
  }, transactionOptions);
}

export async function updateCase(actor: AuthenticatedActor, id: string, input: UpdateCaseInput) {
  return prisma.$transaction(async (tx) => {
    const crmCase = await lockCase(tx, id);
    assertBranchPermission(actor, 'manage', crmCase.branchId);
    await lockActiveBranch(tx, crmCase.branchId);
    return tx.crmCase.update({ where: { id }, data: input, include: caseInclude });
  }, transactionOptions);
}

export async function assignCase(actor: AuthenticatedActor, id: string, input: AssignCaseInput) {
  return prisma.$transaction(async (tx) => {
    const crmCase = await lockCase(tx, id);
    assertBranchPermission(actor, 'manage', crmCase.branchId);
    await lockActiveBranch(tx, crmCase.branchId);
    await assertOwner(tx, input.ownerUserId, crmCase.branchId);
    if (crmCase.ownerUserId === input.ownerUserId)
      throw new AppError(409, 'CRM_CASE_OWNER_UNCHANGED', 'Case owner is unchanged');
    const updated = await tx.crmCase.update({
      where: { id },
      data: { ownerUserId: input.ownerUserId },
      include: caseInclude,
    });
    await tx.crmCaseHistory.create({
      data: {
        caseId: id,
        eventType: 'OWNER_CHANGED',
        fromOwnerUserId: crmCase.ownerUserId,
        toOwnerUserId: input.ownerUserId,
        actorUserId: actor.id,
        note: input.note,
      },
    });
    return updated;
  }, transactionOptions);
}

export async function changeCaseStatus(
  actor: AuthenticatedActor,
  id: string,
  input: ChangeCaseStatusInput,
) {
  return prisma.$transaction(async (tx) => {
    const crmCase = await lockCase(tx, id);
    assertBranchPermission(actor, 'manage', crmCase.branchId);
    await lockActiveBranch(tx, crmCase.branchId);
    assertTransition(crmCase.status, input.status);
    const now = new Date();
    const timestamps =
      input.status === 'RESOLVED'
        ? { resolvedAt: now, closedAt: null }
        : input.status === 'CLOSED'
          ? { closedAt: now }
          : { resolvedAt: null, closedAt: null };
    const updated = await tx.crmCase.update({
      where: { id },
      data: { status: input.status, ...timestamps },
      include: caseInclude,
    });
    await tx.crmCaseHistory.create({
      data: {
        caseId: id,
        eventType: 'STATUS_CHANGED',
        fromStatus: crmCase.status,
        toStatus: input.status,
        actorUserId: actor.id,
        note: input.note,
      },
    });
    return updated;
  }, transactionOptions);
}

async function getReadableCase(actor: AuthenticatedActor, id: string) {
  const crmCase = await getCase(actor, id);
  return crmCase;
}
function timelineQuery(query: InteractionListInput) {
  return { ...query, sortBy: 'occurredAt', sortOrder: 'desc' as const };
}
export async function listCaseHistory(
  actor: AuthenticatedActor,
  id: string,
  query: InteractionListInput,
) {
  await getReadableCase(actor, id);
  const where = { caseId: id };
  const page = timelineQuery(query);
  const [items, totalItems] = await prisma.$transaction([
    prisma.crmCaseHistory.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      ...pagination(page),
    }),
    prisma.crmCaseHistory.count({ where }),
  ]);
  return pageResult(items, totalItems, page);
}
export async function listCaseInteractions(
  actor: AuthenticatedActor,
  id: string,
  query: InteractionListInput,
) {
  await getReadableCase(actor, id);
  const where = { caseId: id };
  const page = timelineQuery(query);
  const [items, totalItems] = await prisma.$transaction([
    prisma.customerInteraction.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      ...pagination(page),
    }),
    prisma.customerInteraction.count({ where }),
  ]);
  return pageResult(items, totalItems, page);
}
export async function listCustomerInteractions(
  actor: AuthenticatedActor,
  customerUserId: string,
  query: InteractionListInput,
) {
  const allowedBranches = accessibleBranches(actor, 'read');
  const where: Prisma.CustomerInteractionWhereInput = {
    customerUserId,
    ...(allowedBranches ? { branchId: { in: allowedBranches } } : {}),
  };
  const page = timelineQuery(query);
  const [items, totalItems] = await prisma.$transaction([
    prisma.customerInteraction.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      ...pagination(page),
    }),
    prisma.customerInteraction.count({ where }),
  ]);
  return pageResult(items, totalItems, page);
}
export async function createInteraction(
  actor: AuthenticatedActor,
  customerUserId: string,
  input: CreateInteractionInput,
) {
  assertBranchPermission(actor, 'manage', input.branchId);
  return prisma.$transaction(async (tx) => {
    await lockActiveBranch(tx, input.branchId);
    await assertCustomer(tx, customerUserId);
    await assertOrder(tx, input.orderId, customerUserId, input.branchId);
    if (input.caseId) {
      const crmCase = await tx.crmCase.findUnique({ where: { id: input.caseId } });
      if (!crmCase) throw new AppError(404, 'CRM_CASE_NOT_FOUND', 'CRM case not found');
      if (
        crmCase.customerUserId !== customerUserId ||
        crmCase.branchId !== input.branchId ||
        crmCase.orderId !== (input.orderId ?? null)
      )
        throw new AppError(
          400,
          'CRM_RELATION_MISMATCH',
          'Case must match the customer, branch, and order',
        );
    }
    return tx.customerInteraction.create({
      data: { ...input, customerUserId, staffUserId: actor.id },
    });
  }, transactionOptions);
}
