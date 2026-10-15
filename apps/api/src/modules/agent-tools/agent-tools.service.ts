import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';
import { prisma } from '../../database/prisma.js';
import {
  assertPermission,
  authenticatedActorSelect,
  requireActor,
  type AuthenticatedActor,
} from '../auth/authorization.js';
import * as paymentService from '../payments/payment.service.js';
import * as rentalService from '../rentals/rental.service.js';
import * as schedulingService from '../scheduling/scheduling.service.js';
import * as transferService from '../transfers/transfer.service.js';
import type {
  AgentApprovalAuthorizationInput,
  AgentToolExecutionInput,
} from './agent-tools.schema.js';
import { getAgentToolDefinition } from './agent-tools.registry.js';

export async function loadInternalToolActor(actorId: string): Promise<AuthenticatedActor> {
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: authenticatedActorSelect,
  });
  return requireActor(actor ?? undefined);
}

export function authorizeAgentApproval(
  actor: AuthenticatedActor,
  input: AgentApprovalAuthorizationInput,
) {
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

function safeOrderView(order: Awaited<ReturnType<typeof rentalService.getOrder>>) {
  // Do not put customer email, phone, notes, gateway references, or evidence URLs in LLM context.
  return {
    id: order.id,
    orderCode: order.orderCode,
    customerUserId: order.customerUserId,
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
    idempotencyKey: payment.idempotencyKey,
  };
}

export async function executeAgentTool(
  actor: AuthenticatedActor,
  input: AgentToolExecutionInput,
  requestId: string,
) {
  const definition = getAgentToolDefinition(input.toolName);
  if (!env[definition.featureFlag]) {
    throw new AppError(503, 'AGENT_TOOL_DISABLED', 'This agent tool is temporarily disabled');
  }

  switch (input.toolName) {
    case 'get_rental_order': {
      const order = await rentalService.getOrder(actor, input.arguments.orderId);
      return observedResult(
        safeOrderView(order),
        requestId,
        definition.requiredPermission,
        order.version,
      );
    }
    case 'check_availability': {
      const availability = await rentalService.checkAvailability(actor, input.arguments);
      return observedResult(availability, requestId, definition.requiredPermission);
    }
    case 'get_payment_summary': {
      const summary = await paymentService.getSettlement(actor, input.arguments.orderId);
      return observedResult(summary, requestId, definition.requiredPermission);
    }
    case 'find_rental_orders': {
      const orders = await rentalService.listOrders(actor, {
        page: 1,
        pageSize: input.arguments.pageSize,
        search: input.arguments.search,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      });
      return observedResult(orders, requestId, definition.requiredPermission);
    }
    case 'get_unit_schedule': {
      const blocks = await schedulingService.listUnitBlocks(actor, {
        unitId: input.arguments.unitId,
        from: input.arguments.from,
        to: input.arguments.to,
        page: 1,
        pageSize: 20,
      });
      return observedResult(blocks, requestId, definition.requiredPermission);
    }
    case 'get_stock_transfer': {
      const transfer = await transferService.getTransfer(actor, input.arguments.transferId);
      return observedResult(transfer, requestId, definition.requiredPermission);
    }
    case 'get_unit_block': {
      const block = await schedulingService.getUnitBlock(actor, input.arguments.blockId);
      return observedResult(block, requestId, definition.requiredPermission);
    }
    case 'get_payment_by_idempotency_key': {
      const payment = await paymentService.getPaymentByIdempotencyKey(
        actor,
        input.arguments.idempotencyKey,
      );
      return observedResult(safePaymentView(payment), requestId, definition.requiredPermission);
    }
    case 'get_payment': {
      const payment = await paymentService.getPayment(actor, input.arguments.paymentId);
      return observedResult(safePaymentView(payment), requestId, definition.requiredPermission);
    }
    case 'get_refund_by_idempotency_key': {
      const refund = await paymentService.getRefundByIdempotencyKey(
        actor,
        input.arguments.idempotencyKey,
      );
      return observedResult(
        {
          id: refund.id,
          paymentId: refund.paymentId,
          amountVnd: refund.amountVnd,
          reason: refund.reason,
          status: refund.status,
          idempotencyKey: refund.idempotencyKey,
        },
        requestId,
        definition.requiredPermission,
      );
    }
    case 'create_unit_block': {
      const block = await schedulingService.createUnitBlock(actor, input.arguments);
      return observedResult(block, requestId, definition.requiredPermission);
    }
    case 'update_unit_block': {
      const { blockId, ...update } = input.arguments;
      const block = await schedulingService.updateUnitBlock(actor, blockId, update);
      return observedResult(block, requestId, definition.requiredPermission);
    }
    case 'cancel_unit_block': {
      const block = await schedulingService.cancelUnitBlock(
        actor,
        input.arguments.blockId,
        input.arguments.reason,
      );
      return observedResult(block, requestId, definition.requiredPermission);
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
    case 'create_stock_transfer': {
      const transfer = await transferService.createTransfer(actor, input.arguments);
      return observedResult(transfer, requestId, definition.requiredPermission, transfer.version);
    }
    case 'approve_stock_transfer': {
      if (!input.expectedVersion)
        throw new AppError(400, 'EXPECTED_VERSION_REQUIRED', 'expectedVersion is required');
      const transfer = await transferService.approveTransfer(actor, input.arguments.transferId, {
        expectedVersion: input.expectedVersion,
      });
      return observedResult(transfer, requestId, definition.requiredPermission, transfer.version);
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
      return observedResult(transfer, requestId, definition.requiredPermission, transfer.version);
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
