import { AppError } from '../../common/errors/app-error.js';
import { prisma } from '../../database/prisma.js';
import { hasPermission, requireActor, type AuthenticatedActor } from '../auth/authorization.js';
import type { ReportQueryInput } from './report.schema.js';

interface Scope {
  branchIds?: string[];
}
interface PaymentRow {
  amountVnd: bigint;
  purpose: 'RENTAL' | 'DEPOSIT' | 'EXTRA';
  method: 'CASH' | 'BANK_TRANSFER' | 'PAYMENT_GATEWAY';
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  paidAt: Date | null;
  createdAt: Date;
  order: { pickupBranchId: string; channel: string; pickupBranch: { timezone: string } };
  refunds: { amountVnd: bigint; status: string; completedAt: Date | null }[];
}

function zero() {
  return 0n;
}

function inRange(value: Date | null, query: ReportQueryInput) {
  return Boolean(value && value >= query.from && value < query.to);
}

function readScope(actor: AuthenticatedActor, requestedBranchId?: string): Scope {
  requireActor(actor);
  if (requestedBranchId) {
    if (!hasPermission(actor, { module: 'reports', action: 'read', branchId: requestedBranchId }))
      throw new AppError(403, 'FORBIDDEN', 'Permission denied for this branch report');
    return { branchIds: [requestedBranchId] };
  }
  if (hasPermission(actor, { module: 'reports', action: 'read' })) return {};

  const branchIds = actor.roleAssignments
    .filter(
      (assignment) =>
        assignment.branchId &&
        assignment.role.isActive &&
        assignment.branch?.status === 'ACTIVE' &&
        assignment.role.rolePermissions.some(
          ({ permission }) =>
            permission.module === 'reports' &&
            permission.action === 'read' &&
            permission.scope === 'BRANCH',
        ),
    )
    .map((assignment) => assignment.branchId!);
  if (!branchIds.length) throw new AppError(403, 'FORBIDDEN', 'Report permission is required');
  return { branchIds: [...new Set(branchIds)] };
}

function orderWhere(query: ReportQueryInput, scope: Scope) {
  return {
    ...(scope.branchIds ? { pickupBranchId: { in: scope.branchIds } } : {}),
    ...(query.channel ? { channel: query.channel } : {}),
  };
}

function timeKey(value: Date, timeZone: string, groupBy: ReportQueryInput['groupBy']) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const day = `${get('year')}-${get('month')}-${get('day')}`;
  if (groupBy === 'day') return day;
  if (groupBy === 'month') return day.slice(0, 7);
  const local = new Date(`${day}T00:00:00.000Z`);
  const weekday = local.getUTCDay() || 7;
  local.setUTCDate(local.getUTCDate() - weekday + 1);
  return local.toISOString().slice(0, 10);
}

async function payments(query: ReportQueryInput, scope: Scope) {
  return (await prisma.payment.findMany({
    where: { order: orderWhere(query, scope) },
    select: {
      amountVnd: true,
      purpose: true,
      method: true,
      status: true,
      paidAt: true,
      createdAt: true,
      refunds: { select: { amountVnd: true, status: true, completedAt: true } },
      order: {
        select: {
          pickupBranchId: true,
          channel: true,
          pickupBranch: { select: { timezone: true } },
        },
      },
    },
  })) as PaymentRow[];
}

function successfulRevenue(rows: PaymentRow[], query: ReportQueryInput) {
  return rows.filter(
    (row) => row.status === 'SUCCEEDED' && row.purpose !== 'DEPOSIT' && inRange(row.paidAt, query),
  );
}

export async function getRevenue(actor: AuthenticatedActor, query: ReportQueryInput) {
  const scope = readScope(actor, query.branchId);
  const rows = successfulRevenue(await payments(query, scope), query);
  const periods = new Map<string, { rentalVnd: bigint; extraVnd: bigint; totalVnd: bigint }>();
  for (const row of rows) {
    const key = timeKey(row.paidAt!, row.order.pickupBranch.timezone, query.groupBy);
    const current = periods.get(key) ?? { rentalVnd: zero(), extraVnd: zero(), totalVnd: zero() };
    if (row.purpose === 'RENTAL') current.rentalVnd += row.amountVnd;
    else current.extraVnd += row.amountVnd;
    current.totalVnd += row.amountVnd;
    periods.set(key, current);
  }
  return {
    ...range(query),
    groupBy: query.groupBy,
    totalRevenueVnd: rows.reduce((sum, row) => sum + row.amountVnd, zero()),
    periods: [...periods.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([period, values]) => ({ period, ...values })),
  };
}

export async function getOverview(actor: AuthenticatedActor, query: ReportQueryInput) {
  const scope = readScope(actor, query.branchId);
  const where = orderWhere(query, scope);
  const [paymentRows, orders] = await Promise.all([
    payments(query, scope),
    prisma.rentalOrder.findMany({
      where: { ...where, createdAt: { gte: query.from, lt: query.to } },
      select: { id: true, status: true, plannedDueAt: true },
    }),
  ]);
  const revenueRows = successfulRevenue(paymentRows, query);
  const completedRefundVnd = paymentRows.reduce(
    (sum, payment) =>
      sum +
      payment.refunds
        .filter((refund) => refund.status === 'COMPLETED' && inRange(refund.completedAt, query))
        .reduce((refundSum, refund) => refundSum + refund.amountVnd, zero()),
    zero(),
  );
  const depositsHeldVnd = paymentRows
    .filter((payment) => payment.status === 'SUCCEEDED' && payment.purpose === 'DEPOSIT')
    .reduce((sum, payment) => sum + payment.amountVnd, zero());
  const outstandingVnd = paymentRows
    .filter((payment) => payment.status === 'PENDING')
    .reduce((sum, payment) => sum + payment.amountVnd, zero());
  const revenueVnd = revenueRows.reduce((sum, payment) => sum + payment.amountVnd, zero());
  return {
    ...range(query),
    ordersCreated: orders.length,
    overdueOrders: orders.filter(
      (order) => order.status === 'ACTIVE' && order.plannedDueAt < new Date(),
    ).length,
    revenueVnd,
    rentalRevenueVnd: revenueRows
      .filter((payment) => payment.purpose === 'RENTAL')
      .reduce((sum, payment) => sum + payment.amountVnd, zero()),
    extraRevenueVnd: revenueRows
      .filter((payment) => payment.purpose === 'EXTRA')
      .reduce((sum, payment) => sum + payment.amountVnd, zero()),
    depositsHeldVnd,
    completedRefundVnd,
    outstandingVnd,
    averageOrderValueVnd: orders.length ? revenueVnd / BigInt(orders.length) : zero(),
  };
}

export async function getRentals(actor: AuthenticatedActor, query: ReportQueryInput) {
  const scope = readScope(actor, query.branchId);
  const orders = await prisma.rentalOrder.findMany({
    where: {
      ...orderWhere(query, scope),
      createdAt: { gte: query.from, lt: query.to },
    },
    select: { status: true, plannedDueAt: true },
  });
  const byStatus = new Map<string, number>();
  for (const order of orders) byStatus.set(order.status, (byStatus.get(order.status) ?? 0) + 1);
  return {
    ...range(query),
    totalOrders: orders.length,
    overdueOrders: orders.filter(
      (order) => order.status === 'ACTIVE' && order.plannedDueAt < new Date(),
    ).length,
    byStatus: [...byStatus.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([status, count]) => ({ status, count })),
  };
}

export async function getPayments(actor: AuthenticatedActor, query: ReportQueryInput) {
  const scope = readScope(actor, query.branchId);
  const rows = (await payments(query, scope)).filter((payment) =>
    inRange(payment.createdAt, query),
  );
  const byStatus = new Map<string, { count: number; amountVnd: bigint }>();
  const byMethod = new Map<string, { count: number; amountVnd: bigint }>();
  for (const payment of rows) {
    for (const [key, map] of [
      [payment.status, byStatus],
      [payment.method, byMethod],
    ] as const) {
      const current = map.get(key) ?? { count: 0, amountVnd: zero() };
      current.count += 1;
      current.amountVnd += payment.amountVnd;
      map.set(key, current);
    }
  }
  const serialize = (map: Map<string, { count: number; amountVnd: bigint }>, property: string) =>
    [...map.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([value, totals]) => ({ [property]: value, ...totals }));
  return {
    ...range(query),
    totalPayments: rows.length,
    byStatus: serialize(byStatus, 'status'),
    byMethod: serialize(byMethod, 'method'),
  };
}

export async function getInventory(actor: AuthenticatedActor, query: ReportQueryInput) {
  const scope = readScope(actor, query.branchId);
  const units = await prisma.costumeUnit.findMany({
    where: scope.branchIds ? { currentBranchId: { in: scope.branchIds } } : {},
    select: { operationalStatus: true, conditionGrade: true },
  });
  const count = (property: 'operationalStatus' | 'conditionGrade') => {
    const totals = new Map<string, number>();
    for (const unit of units) {
      const value = unit[property];
      totals.set(value, (totals.get(value) ?? 0) + 1);
    }
    return [...totals.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([value, total]) => ({ [property]: value, count: total }));
  };
  return {
    ...range(query),
    totalUnits: units.length,
    byOperationalStatus: count('operationalStatus'),
    byConditionGrade: count('conditionGrade'),
  };
}

function range(query: ReportQueryInput) {
  return {
    from: query.from,
    to: query.to,
    branchId: query.branchId ?? null,
    channel: query.channel ?? null,
  };
}
