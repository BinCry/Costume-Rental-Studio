import { createHash } from 'node:crypto';

import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';
import { prisma } from '../../database/prisma.js';
import {
  assertPermission,
  authenticatedActorSelect,
  requireActor,
  type AuthenticatedActor,
} from '../auth/authorization.js';
import * as crmService from '../crm/crm.service.js';
import * as paymentService from '../payments/payment.service.js';
import * as rentalService from '../rentals/rental.service.js';
import * as rentalOverdueService from '../rentals/rental-overdue.service.js';
import * as rentalReadinessService from '../rentals/rental-readiness.service.js';
import * as schedulingService from '../scheduling/scheduling.service.js';
import * as operationalCapacityService from '../scheduling/operational-capacity.service.js';
import * as transferService from '../transfers/transfer.service.js';
import type {
  AgentApprovalAuthorizationInput,
  AgentToolExecutionInput,
  AgentToolName,
} from './agent-tools.schema.js';
import { getAgentToolDefinition } from './agent-tools.registry.js';

export async function loadInternalToolActor(actorId: string): Promise<AuthenticatedActor> {
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: authenticatedActorSelect,
  });
  return requireActor(actor ?? undefined);
}

export async function authorizeAgentApproval(
  actor: AuthenticatedActor,
  input: AgentApprovalAuthorizationInput,
  caseBranchId: string,
) {
  const branch = await prisma.branch.findUnique({
    where: { id: caseBranchId },
    select: { status: true },
  });
  if (branch?.status !== 'ACTIVE') {
    throw new AppError(404, 'AGENT_CASE_NOT_FOUND', 'Agent case not found');
  }
  if (!input.branchIds.includes(caseBranchId)) {
    throw new AppError(404, 'AGENT_CASE_NOT_FOUND', 'Agent case not found');
  }
  const requestedBranches = await Promise.all(
    input.branchIds.map((id) =>
      prisma.branch.findUnique({ where: { id }, select: { status: true } }),
    ),
  );
  if (requestedBranches.some((requestedBranch) => requestedBranch?.status !== 'ACTIVE')) {
    throw new AppError(404, 'AGENT_CASE_NOT_FOUND', 'Agent case not found');
  }
  const [module, action] = input.requiredPermission.split(':') as [string, string];
  for (const branchId of input.branchIds) {
    assertPermission(actor, { module, action, branchId });
  }
  return { decision: 'allowed' as const, checkedAt: new Date().toISOString() };
}

function observedResult(
  data: unknown,
  requestId: string,
  requiredPermission: { module: string; action: string },
  recordVersion?: number,
) {
  const observedAt = new Date().toISOString();
  return {
    status: 'ok' as const,
    data,
    source: 'studio-api' as const,
    observedAt,
    requestId,
    details: {
      authorization: {
        decision: 'allowed' as const,
        requiredPermission: `${requiredPermission.module}:${requiredPermission.action}`,
        checkedAt: observedAt,
      },
    },
    ...(recordVersion === undefined ? {} : { recordVersion }),
  };
}

function assertCaseBranch(resourceBranchId: string, caseBranchId: string): void {
  if (resourceBranchId !== caseBranchId) {
    throw new AppError(
      404,
      'AGENT_CASE_RESOURCE_NOT_FOUND',
      'Resource not found in this case branch',
    );
  }
}

const releasedWriteReadbacks = new Map<AgentToolName, AgentToolName>([
  ['reallocate_rental_item', 'get_rental_order'],
  ['record_overdue_follow_up', 'get_customer_interaction_by_idempotency_key'],
]);

function canonicalJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizeFrozenValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.valueOf())) return parsed.toISOString();
  }
  if (Array.isArray(value)) return value.map(normalizeFrozenValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeFrozenValue(item)]),
    );
  }
  return value;
}

function assertReleasedWriteAuthorization(input: AgentToolExecutionInput): void {
  const expectedReadback = releasedWriteReadbacks.get(input.toolName);
  if (!expectedReadback) {
    throw new AppError(
      503,
      'AGENT_WRITE_TOOLS_NOT_READY',
      'This agent write tool is not released for execution',
    );
  }
  if (!input.confirmationId || !input.payloadHash || !input.readbackTool || !input.actionSnapshot) {
    throw new AppError(
      403,
      'AGENT_WRITE_AUTHORIZATION_REQUIRED',
      'A frozen human confirmation is required for this write tool',
    );
  }
  if (input.readbackTool !== expectedReadback) {
    throw new AppError(
      409,
      'AGENT_WRITE_AUTHORIZATION_MISMATCH',
      'The write read-back contract does not match the released tool',
    );
  }
  const { payloadHash: snapshotHash, ...unsignedSnapshot } = input.actionSnapshot;
  const actualHash = createHash('sha256').update(canonicalJson(unsignedSnapshot)).digest('hex');
  const expectedIdempotencyKey = `agent:${input.caseId}:${input.toolName}:${input.payloadHash}`;
  const snapshotMatchesRequest =
    input.actionSnapshot.toolName === input.toolName &&
    input.actionSnapshot.readbackTool === input.readbackTool &&
    (input.actionSnapshot.expectedVersion ?? null) === (input.expectedVersion ?? null) &&
    canonicalJson(normalizeFrozenValue(input.actionSnapshot.arguments)) ===
      canonicalJson(normalizeFrozenValue(input.arguments));
  if (
    actualHash !== input.payloadHash ||
    snapshotHash !== input.payloadHash ||
    input.idempotencyKey !== expectedIdempotencyKey ||
    !snapshotMatchesRequest
  ) {
    throw new AppError(
      409,
      'AGENT_WRITE_AUTHORIZATION_MISMATCH',
      'The write payload no longer matches the frozen human confirmation',
    );
  }
}

function safeOrderView(order: Awaited<ReturnType<typeof rentalService.getOrder>>) {
  // Do not put customer email, phone, notes, gateway references, or evidence URLs in LLM context.
  return {
    id: order.id,
    orderCode: order.orderCode,
    pickupBranchId: order.pickupBranchId,
    status: order.status,
    plannedStartAt: order.plannedStartAt,
    plannedDueAt: order.plannedDueAt,
    version: order.version,
    items: order.items.map((item) => ({
      id: item.id,
      variantId: item.variantId,
      unitId: item.unitId,
      occupiedFrom: item.occupiedFrom,
      occupiedUntil: item.occupiedUntil,
    })),
  };
}

function safePaymentView(payment: Awaited<ReturnType<typeof paymentService.getPayment>>) {
  return {
    id: payment.id,
    orderId: payment.orderId,
    pickupBranchId: payment.order.pickupBranchId,
    purpose: payment.purpose,
    amountVnd: payment.amountVnd,
    status: payment.status,
  };
}

type UnitBlock = Awaited<ReturnType<typeof schedulingService.getUnitBlock>>;

function safeUnitBlockView(block: UnitBlock) {
  return {
    id: block.id,
    unitId: block.unitId,
    blockType: block.blockType,
    status: block.status,
    blockedFrom: block.blockedFrom,
    blockedUntil: block.blockedUntil,
    costVnd: block.costVnd,
    startedAt: block.startedAt,
    finishedAt: block.finishedAt,
    createdAt: block.createdAt,
    updatedAt: block.updatedAt,
    unit: {
      id: block.unit.id,
      unitCode: block.unit.unitCode,
      conditionGrade: block.unit.conditionGrade,
      operationalStatus: block.unit.operationalStatus,
      variant: {
        id: block.unit.variant.id,
        variantCode: block.unit.variant.variantCode,
        sizeCode: block.unit.variant.sizeCode,
        colorCode: block.unit.variant.colorCode,
        editionLabel: block.unit.variant.editionLabel,
      },
      currentBranch: {
        id: block.unit.currentBranch.id,
        branchCode: block.unit.currentBranch.branchCode,
        name: block.unit.currentBranch.name,
      },
    },
    assignee: block.assignee ? { employeeCode: block.assignee.employeeCode } : null,
  };
}

type Transfer = Awaited<ReturnType<typeof transferService.getTransfer>>;

function safeTransferView(transfer: Transfer) {
  const employeeCode = (employee: Transfer['requester'] | null) =>
    employee ? { employeeCode: employee.employeeCode } : null;

  return {
    id: transfer.id,
    transferCode: transfer.transferCode,
    fromBranchId: transfer.fromBranchId,
    toBranchId: transfer.toBranchId,
    status: transfer.status,
    version: transfer.version,
    approvedAt: transfer.approvedAt,
    shippedAt: transfer.shippedAt,
    receivedAt: transfer.receivedAt,
    endedAt: transfer.endedAt,
    createdAt: transfer.createdAt,
    updatedAt: transfer.updatedAt,
    fromBranch: {
      id: transfer.fromBranch.id,
      branchCode: transfer.fromBranch.branchCode,
      name: transfer.fromBranch.name,
    },
    toBranch: {
      id: transfer.toBranch.id,
      branchCode: transfer.toBranch.branchCode,
      name: transfer.toBranch.name,
    },
    requester: employeeCode(transfer.requester),
    approver: employeeCode(transfer.approver),
    shipper: employeeCode(transfer.shipper),
    receiver: employeeCode(transfer.receiver),
    ender: employeeCode(transfer.ender),
    items: transfer.items.map((item) => ({
      id: item.id,
      unitId: item.unitId,
      conditionOut: item.conditionOut,
      conditionIn: item.conditionIn,
      receivedOperationalStatus: item.receivedOperationalStatus,
      unit: {
        id: item.unit.id,
        unitCode: item.unit.unitCode,
        currentBranchId: item.unit.currentBranchId,
        conditionGrade: item.unit.conditionGrade,
        operationalStatus: item.unit.operationalStatus,
        currentBranch: {
          id: item.unit.currentBranch.id,
          branchCode: item.unit.currentBranch.branchCode,
          name: item.unit.currentBranch.name,
        },
        variant: {
          id: item.unit.variant.id,
          variantCode: item.unit.variant.variantCode,
          sizeCode: item.unit.variant.sizeCode,
          colorCode: item.unit.variant.colorCode,
          editionLabel: item.unit.variant.editionLabel,
          model: {
            id: item.unit.variant.model.id,
            modelCode: item.unit.variant.model.modelCode,
            name: item.unit.variant.model.name,
            category: { name: item.unit.variant.model.category.name },
          },
        },
      },
    })),
  };
}

function safeCaseTransferView(transfer: Transfer, caseBranchId: string) {
  return {
    id: transfer.id,
    transferCode: transfer.transferCode,
    status: transfer.status,
    version: transfer.version,
    caseBranchRole: transfer.fromBranchId === caseBranchId ? 'FROM' : 'TO',
  };
}

function safeCustomerInteractionView(
  interaction: Awaited<ReturnType<typeof crmService.getCustomerInteractionByIdempotencyKey>>,
) {
  return {
    id: interaction.id,
    branchId: interaction.branchId,
    orderId: interaction.orderId,
    interactionType: interaction.interactionType,
    channel: interaction.channel,
    outcome: interaction.outcome,
    promisedReturnAt: interaction.promisedReturnAt,
    nextFollowUpAt: interaction.nextFollowUpAt,
    sourceReference: interaction.sourceReference,
    idempotencyKey: interaction.idempotencyKey,
    occurredAt: interaction.occurredAt,
  };
}

export async function executeAgentTool(
  actor: AuthenticatedActor,
  input: AgentToolExecutionInput,
  requestId: string,
  caseBranchId: string,
) {
  const definition = getAgentToolDefinition(input.toolName);
  if (definition.mode === 'write' && !releasedWriteReadbacks.has(input.toolName)) {
    throw new AppError(503, 'AGENT_WRITE_TOOLS_NOT_READY', 'This agent write tool is not released');
  }
  const branch = await prisma.branch.findUnique({
    where: { id: caseBranchId },
    select: { status: true },
  });
  if (branch?.status !== 'ACTIVE') {
    throw new AppError(404, 'AGENT_CASE_NOT_FOUND', 'Agent case not found');
  }
  assertPermission(actor, {
    ...definition.requiredPermission,
    branchId: caseBranchId,
  });
  if (!env[definition.featureFlag]) {
    throw new AppError(503, 'AGENT_TOOL_DISABLED', 'This agent tool is temporarily disabled');
  }
  if (definition.mode === 'write') assertReleasedWriteAuthorization(input);

  switch (input.toolName) {
    case 'get_rental_order': {
      const order = await rentalService.getOrder(actor, input.arguments.orderId);
      assertCaseBranch(order.pickupBranchId, caseBranchId);
      return observedResult(
        safeOrderView(order),
        requestId,
        definition.requiredPermission,
        order.version,
      );
    }
    case 'check_availability': {
      assertCaseBranch(input.arguments.pickupBranchId, caseBranchId);
      const availability = await rentalService.checkAvailability(actor, input.arguments);
      return observedResult(availability, requestId, definition.requiredPermission);
    }
    case 'get_rental_readiness_context': {
      const context = await rentalReadinessService.getRentalReadinessContext(
        actor,
        input.arguments,
      );
      return observedResult(
        context,
        requestId,
        definition.requiredPermission,
        context.primaryOrder.version,
      );
    }
    case 'get_overdue_rental_context': {
      const context = await rentalOverdueService.getOverdueRentalContext(actor, input.arguments);
      return observedResult(
        context,
        requestId,
        definition.requiredPermission,
        context.primaryOrder.version,
      );
    }
    case 'get_customer_interaction_by_idempotency_key': {
      const interaction = await crmService.getCustomerInteractionByIdempotencyKey(
        actor,
        input.arguments.idempotencyKey,
      );
      return observedResult(
        safeCustomerInteractionView(interaction),
        requestId,
        definition.requiredPermission,
      );
    }
    case 'get_operational_capacity_context': {
      const context = await operationalCapacityService.getOperationalCapacityContext(
        actor,
        input.arguments,
      );
      return observedResult(context, requestId, definition.requiredPermission);
    }
    case 'get_payment_summary': {
      const order = await rentalService.getOrder(actor, input.arguments.orderId);
      assertCaseBranch(order.pickupBranchId, caseBranchId);
      const summary = await paymentService.getSettlement(actor, input.arguments.orderId);
      return observedResult(summary, requestId, definition.requiredPermission);
    }
    case 'find_rental_orders': {
      const orders = await rentalService.listOrders(actor, {
        page: 1,
        pageSize: input.arguments.pageSize,
        search: input.arguments.search,
        pickupBranchId: caseBranchId,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      });
      return observedResult(
        { ...orders, items: orders.items.map(safeOrderView) },
        requestId,
        definition.requiredPermission,
      );
    }
    case 'get_unit_schedule': {
      const unit = await prisma.costumeUnit.findUnique({
        where: { id: input.arguments.unitId },
        select: { currentBranchId: true },
      });
      if (unit?.currentBranchId !== caseBranchId) {
        throw new AppError(404, 'UNIT_NOT_FOUND', 'Unit not found');
      }
      const blocks = await schedulingService.listUnitBlocks(actor, {
        unitId: input.arguments.unitId,
        branchId: caseBranchId,
        from: input.arguments.from,
        to: input.arguments.to,
        page: 1,
        pageSize: 20,
      });
      const rentals = await prisma.rentalOrderItem.findMany({
        where: {
          unitId: input.arguments.unitId,
          order: {
            status: {
              in: ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'ACTIVE', 'RETURN_INSPECTION'],
            },
          },
          ...(input.arguments.from ? { occupiedUntil: { gt: input.arguments.from } } : {}),
          ...(input.arguments.to ? { occupiedFrom: { lt: input.arguments.to } } : {}),
        },
        orderBy: { occupiedFrom: 'asc' },
        take: 20,
        select: {
          occupiedFrom: true,
          occupiedUntil: true,
          allocationStatus: true,
          order: { select: { orderCode: true, status: true, pickupBranchId: true } },
        },
      });
      return observedResult(
        {
          ...blocks,
          items: blocks.items.map(safeUnitBlockView),
          rentals: rentals.map((rental) => ({
            orderCode: rental.order.pickupBranchId === caseBranchId ? rental.order.orderCode : null,
            orderStatus: rental.order.status,
            allocationStatus: rental.allocationStatus,
            occupiedFrom: rental.occupiedFrom,
            occupiedUntil: rental.occupiedUntil,
          })),
        },
        requestId,
        definition.requiredPermission,
      );
    }
    case 'get_stock_transfer': {
      const transfer = await transferService.getTransfer(actor, input.arguments.transferId);
      if (transfer.fromBranchId !== caseBranchId && transfer.toBranchId !== caseBranchId) {
        throw new AppError(404, 'TRANSFER_NOT_FOUND', 'Transfer not found');
      }
      return observedResult(
        safeCaseTransferView(transfer, caseBranchId),
        requestId,
        definition.requiredPermission,
      );
    }
    case 'get_unit_block': {
      const block = await schedulingService.getUnitBlock(actor, input.arguments.blockId);
      assertCaseBranch(block.unit.currentBranchId, caseBranchId);
      return observedResult(safeUnitBlockView(block), requestId, definition.requiredPermission);
    }
    case 'get_payment_by_idempotency_key': {
      const payment = await paymentService.getPaymentByIdempotencyKey(
        actor,
        input.arguments.idempotencyKey,
      );
      assertCaseBranch(payment.order.pickupBranchId, caseBranchId);
      return observedResult(safePaymentView(payment), requestId, definition.requiredPermission);
    }
    case 'get_payment': {
      const payment = await paymentService.getPayment(actor, input.arguments.paymentId);
      assertCaseBranch(payment.order.pickupBranchId, caseBranchId);
      return observedResult(safePaymentView(payment), requestId, definition.requiredPermission);
    }
    case 'get_refund_by_idempotency_key': {
      const refund = await paymentService.getRefundByIdempotencyKey(
        actor,
        input.arguments.idempotencyKey,
      );
      assertCaseBranch(refund.payment.order.pickupBranchId, caseBranchId);
      return observedResult(
        {
          id: refund.id,
          paymentId: refund.paymentId,
          amountVnd: refund.amountVnd,
          status: refund.status,
        },
        requestId,
        definition.requiredPermission,
      );
    }
    case 'create_unit_block': {
      const block = await schedulingService.createUnitBlock(actor, input.arguments);
      return observedResult(safeUnitBlockView(block), requestId, definition.requiredPermission);
    }
    case 'update_unit_block': {
      const { blockId, ...update } = input.arguments;
      const block = await schedulingService.updateUnitBlock(actor, blockId, update);
      return observedResult(safeUnitBlockView(block), requestId, definition.requiredPermission);
    }
    case 'cancel_unit_block': {
      const block = await schedulingService.cancelUnitBlock(
        actor,
        input.arguments.blockId,
        input.arguments.reason,
      );
      return observedResult(safeUnitBlockView(block), requestId, definition.requiredPermission);
    }
    case 'extend_rental_order': {
      if (!input.expectedVersion)
        throw new AppError(400, 'EXPECTED_VERSION_REQUIRED', 'expectedVersion is required');
      const { orderId, ...extension } = input.arguments;
      const order = await rentalService.extendOrder(actor, orderId, {
        ...extension,
        expectedVersion: input.expectedVersion,
      });
      return observedResult(
        safeOrderView(order),
        requestId,
        definition.requiredPermission,
        order.version,
      );
    }
    case 'reallocate_rental_item': {
      if (!input.expectedVersion)
        throw new AppError(400, 'EXPECTED_VERSION_REQUIRED', 'expectedVersion is required');
      const { orderId, ...allocation } = input.arguments;
      const resource = await prisma.rentalOrder.findUnique({
        where: { id: orderId },
        select: { pickupBranchId: true },
      });
      if (!resource) throw new AppError(404, 'RENTAL_ORDER_NOT_FOUND', 'Rental order not found');
      assertCaseBranch(resource.pickupBranchId, caseBranchId);
      const order = await rentalService.reallocateOrder(actor, orderId, {
        ...allocation,
        expectedVersion: input.expectedVersion,
      });
      return observedResult(
        safeOrderView(order),
        requestId,
        definition.requiredPermission,
        order.version,
      );
    }
    case 'cancel_rental_order': {
      if (!input.expectedVersion)
        throw new AppError(400, 'EXPECTED_VERSION_REQUIRED', 'expectedVersion is required');
      const order = await rentalService.cancelOrder(
        actor,
        input.arguments.orderId,
        input.expectedVersion,
        input.arguments.reason,
      );
      return observedResult(
        safeOrderView(order),
        requestId,
        definition.requiredPermission,
        order.version,
      );
    }
    case 'record_overdue_follow_up': {
      const resource = await prisma.rentalOrder.findUnique({
        where: { id: input.arguments.orderId },
        select: { pickupBranchId: true },
      });
      if (!resource) throw new AppError(404, 'RENTAL_ORDER_NOT_FOUND', 'Rental order not found');
      assertCaseBranch(resource.pickupBranchId, caseBranchId);
      const interaction = await crmService.recordOverdueFollowUp(actor, {
        ...input.arguments,
        sourceReference: `agent-case:${input.caseId}`,
        idempotencyKey: input.idempotencyKey,
      });
      return observedResult(
        safeCustomerInteractionView(interaction),
        requestId,
        definition.requiredPermission,
      );
    }
    case 'create_stock_transfer': {
      const transfer = await transferService.createTransfer(actor, input.arguments);
      return observedResult(
        safeTransferView(transfer),
        requestId,
        definition.requiredPermission,
        transfer.version,
      );
    }
    case 'approve_stock_transfer': {
      if (!input.expectedVersion)
        throw new AppError(400, 'EXPECTED_VERSION_REQUIRED', 'expectedVersion is required');
      const transfer = await transferService.approveTransfer(actor, input.arguments.transferId, {
        expectedVersion: input.expectedVersion,
      });
      return observedResult(
        safeTransferView(transfer),
        requestId,
        definition.requiredPermission,
        transfer.version,
      );
    }
    case 'reject_stock_transfer': {
      if (!input.expectedVersion)
        throw new AppError(400, 'EXPECTED_VERSION_REQUIRED', 'expectedVersion is required');
      const transfer = await transferService.endTransfer(
        actor,
        input.arguments.transferId,
        'REJECTED',
        { expectedVersion: input.expectedVersion, reason: input.arguments.reason },
      );
      return observedResult(
        safeTransferView(transfer),
        requestId,
        definition.requiredPermission,
        transfer.version,
      );
    }
    case 'create_payment_checkout': {
      const payment = await paymentService.createCheckout(actor, input.arguments.orderId, {
        purpose: input.arguments.purpose,
        amountVnd: input.arguments.amountVnd,
        idempotencyKey: input.idempotencyKey,
      });
      return observedResult(payment, requestId, definition.requiredPermission);
    }
    case 'request_refund': {
      const refund = await paymentService.createRefund(actor, input.arguments.paymentId, {
        amountVnd: input.arguments.amountVnd,
        reason: input.arguments.reason,
        idempotencyKey: input.idempotencyKey,
      });
      return observedResult(refund, requestId, definition.requiredPermission);
    }
  }
}
