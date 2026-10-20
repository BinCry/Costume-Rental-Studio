import type { AgentToolName } from './agent-tools.schema.js';

export interface AgentToolDefinition {
  name: AgentToolName;
  mode: 'read' | 'write';
  requiredPermission: { module: string; action: 'read' | 'manage' };
  retrySafe: boolean;
  featureFlag:
    | 'AGENT_READ_TOOLS_ENABLED'
    | 'AGENT_SCHEDULING_WRITE_ENABLED'
    | 'AGENT_RENTAL_WRITE_ENABLED'
    | 'AGENT_CRM_WRITE_ENABLED'
    | 'AGENT_TRANSFER_WRITE_ENABLED'
    | 'AGENT_FINANCIAL_WRITE_ENABLED';
}

/**
 * Fixed allowlist.  The agent can select one of these names, never a URL,
 * HTTP method, SQL statement, or arbitrary service operation.
 */
export const agentToolRegistry: Readonly<Record<AgentToolName, AgentToolDefinition>> = {
  get_rental_order: {
    name: 'get_rental_order',
    mode: 'read',
    requiredPermission: { module: 'rentals', action: 'read' },
    retrySafe: true,
    featureFlag: 'AGENT_READ_TOOLS_ENABLED',
  },
  check_availability: {
    name: 'check_availability',
    mode: 'read',
    requiredPermission: { module: 'rentals', action: 'read' },
    retrySafe: true,
    featureFlag: 'AGENT_READ_TOOLS_ENABLED',
  },
  get_rental_readiness_context: {
    name: 'get_rental_readiness_context',
    mode: 'read',
    requiredPermission: { module: 'rentals', action: 'read' },
    retrySafe: true,
    featureFlag: 'AGENT_READ_TOOLS_ENABLED',
  },
  get_overdue_rental_context: {
    name: 'get_overdue_rental_context',
    mode: 'read',
    requiredPermission: { module: 'rentals', action: 'read' },
    retrySafe: true,
    featureFlag: 'AGENT_READ_TOOLS_ENABLED',
  },
  get_customer_interaction_by_idempotency_key: {
    name: 'get_customer_interaction_by_idempotency_key',
    mode: 'read',
    requiredPermission: { module: 'crm', action: 'read' },
    retrySafe: true,
    featureFlag: 'AGENT_READ_TOOLS_ENABLED',
  },
  get_operational_capacity_context: {
    name: 'get_operational_capacity_context',
    mode: 'read',
    requiredPermission: { module: 'inventory', action: 'read' },
    retrySafe: true,
    featureFlag: 'AGENT_READ_TOOLS_ENABLED',
  },
  get_payment_summary: {
    name: 'get_payment_summary',
    mode: 'read',
    requiredPermission: { module: 'payments', action: 'read' },
    retrySafe: true,
    featureFlag: 'AGENT_READ_TOOLS_ENABLED',
  },
  find_rental_orders: {
    name: 'find_rental_orders',
    mode: 'read',
    requiredPermission: { module: 'rentals', action: 'read' },
    retrySafe: true,
    featureFlag: 'AGENT_READ_TOOLS_ENABLED',
  },
  get_unit_schedule: {
    name: 'get_unit_schedule',
    mode: 'read',
    requiredPermission: { module: 'inventory', action: 'read' },
    retrySafe: true,
    featureFlag: 'AGENT_READ_TOOLS_ENABLED',
  },
  get_stock_transfer: {
    name: 'get_stock_transfer',
    mode: 'read',
    requiredPermission: { module: 'transfers', action: 'read' },
    retrySafe: true,
    featureFlag: 'AGENT_READ_TOOLS_ENABLED',
  },
  get_unit_block: {
    name: 'get_unit_block',
    mode: 'read',
    requiredPermission: { module: 'inventory', action: 'read' },
    retrySafe: true,
    featureFlag: 'AGENT_READ_TOOLS_ENABLED',
  },
  get_payment_by_idempotency_key: {
    name: 'get_payment_by_idempotency_key',
    mode: 'read',
    requiredPermission: { module: 'payments', action: 'read' },
    retrySafe: true,
    featureFlag: 'AGENT_READ_TOOLS_ENABLED',
  },
  get_payment: {
    name: 'get_payment',
    mode: 'read',
    requiredPermission: { module: 'payments', action: 'read' },
    retrySafe: true,
    featureFlag: 'AGENT_READ_TOOLS_ENABLED',
  },
  get_refund_by_idempotency_key: {
    name: 'get_refund_by_idempotency_key',
    mode: 'read',
    requiredPermission: { module: 'payments', action: 'read' },
    retrySafe: true,
    featureFlag: 'AGENT_READ_TOOLS_ENABLED',
  },
  create_unit_block: {
    name: 'create_unit_block',
    mode: 'write',
    requiredPermission: { module: 'inventory', action: 'manage' },
    retrySafe: false,
    featureFlag: 'AGENT_SCHEDULING_WRITE_ENABLED',
  },
  update_unit_block: {
    name: 'update_unit_block',
    mode: 'write',
    requiredPermission: { module: 'inventory', action: 'manage' },
    retrySafe: false,
    featureFlag: 'AGENT_SCHEDULING_WRITE_ENABLED',
  },
  cancel_unit_block: {
    name: 'cancel_unit_block',
    mode: 'write',
    requiredPermission: { module: 'inventory', action: 'manage' },
    retrySafe: false,
    featureFlag: 'AGENT_SCHEDULING_WRITE_ENABLED',
  },
  extend_rental_order: {
    name: 'extend_rental_order',
    mode: 'write',
    requiredPermission: { module: 'rentals', action: 'manage' },
    retrySafe: false,
    featureFlag: 'AGENT_RENTAL_WRITE_ENABLED',
  },
  reallocate_rental_item: {
    name: 'reallocate_rental_item',
    mode: 'write',
    requiredPermission: { module: 'rentals', action: 'manage' },
    retrySafe: false,
    featureFlag: 'AGENT_RENTAL_WRITE_ENABLED',
  },
  cancel_rental_order: {
    name: 'cancel_rental_order',
    mode: 'write',
    requiredPermission: { module: 'rentals', action: 'manage' },
    retrySafe: false,
    featureFlag: 'AGENT_RENTAL_WRITE_ENABLED',
  },
  record_overdue_follow_up: {
    name: 'record_overdue_follow_up',
    mode: 'write',
    requiredPermission: { module: 'crm', action: 'manage' },
    retrySafe: false,
    featureFlag: 'AGENT_CRM_WRITE_ENABLED',
  },
  create_stock_transfer: {
    name: 'create_stock_transfer',
    mode: 'write',
    requiredPermission: { module: 'transfers', action: 'manage' },
    retrySafe: false,
    featureFlag: 'AGENT_TRANSFER_WRITE_ENABLED',
  },
  approve_stock_transfer: {
    name: 'approve_stock_transfer',
    mode: 'write',
    requiredPermission: { module: 'transfers', action: 'manage' },
    retrySafe: false,
    featureFlag: 'AGENT_TRANSFER_WRITE_ENABLED',
  },
  reject_stock_transfer: {
    name: 'reject_stock_transfer',
    mode: 'write',
    requiredPermission: { module: 'transfers', action: 'manage' },
    retrySafe: false,
    featureFlag: 'AGENT_TRANSFER_WRITE_ENABLED',
  },
  create_payment_checkout: {
    name: 'create_payment_checkout',
    mode: 'write',
    requiredPermission: { module: 'payments', action: 'manage' },
    retrySafe: false,
    featureFlag: 'AGENT_FINANCIAL_WRITE_ENABLED',
  },
  request_refund: {
    name: 'request_refund',
    mode: 'write',
    requiredPermission: { module: 'payments', action: 'manage' },
    retrySafe: false,
    featureFlag: 'AGENT_FINANCIAL_WRITE_ENABLED',
  },
};

export function getAgentToolDefinition(name: AgentToolName): AgentToolDefinition {
  return agentToolRegistry[name];
}
