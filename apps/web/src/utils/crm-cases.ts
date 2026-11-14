import type { CaseStatus as CrmCaseStatus } from '../fixtures/studio';

// Mirrors assertTransition in apps/api/src/modules/crm/crm.service.ts.
const transitions: Record<CrmCaseStatus, readonly CrmCaseStatus[]> = {
  OPEN: ['IN_PROGRESS', 'RESOLVED'],
  IN_PROGRESS: ['OPEN', 'RESOLVED'],
  RESOLVED: ['IN_PROGRESS', 'CLOSED'],
  CLOSED: ['IN_PROGRESS'],
};
const order: readonly CrmCaseStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

/** The current status plus the statuses a case may move to next, in workflow order. */
export function nextCaseStatuses(current: CrmCaseStatus): CrmCaseStatus[] {
  return order.filter((status) => status === current || transitions[current].includes(status));
}
