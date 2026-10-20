import { describe, expect, it } from 'vitest';

import {
  createCaseSchema,
  createInteractionSchema,
  listCasesSchema,
  updateCaseSchema,
} from '../src/modules/crm/crm.schema.js';

const id = '10000000-0000-4000-8000-000000000001';

describe('CRM schemas', () => {
  it('applies safe case-list defaults and accepts CRM filters', () => {
    expect(listCasesSchema.parse({})).toMatchObject({
      page: 1,
      pageSize: 20,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    });
    expect(listCasesSchema.parse({ status: 'IN_PROGRESS', overdue: 'true' })).toMatchObject({
      status: 'IN_PROGRESS',
      overdue: true,
    });
  });

  it('requires branch context and valid enum values for writes', () => {
    expect(
      createCaseSchema.safeParse({
        customerUserId: id,
        branchId: id,
        subject: 'Need help',
        caseType: 'SUPPORT',
      }).success,
    ).toBe(true);
    expect(
      createCaseSchema.safeParse({ customerUserId: id, subject: 'Need help', caseType: 'SUPPORT' })
        .success,
    ).toBe(false);
    expect(
      createInteractionSchema.safeParse({
        branchId: id,
        interactionType: 'FOLLOW_UP',
        channel: 'CHAT',
        outcome: 'PROMISED_RETURN',
        occurredAt: '2026-10-19T12:00:00Z',
        promisedReturnAt: '2026-10-20T08:00:00Z',
        nextFollowUpAt: '2026-10-20T09:00:00Z',
        summary: 'Called back',
      }).success,
    ).toBe(true);
    expect(
      createInteractionSchema.safeParse({
        branchId: id,
        interactionType: 'OTHER',
        channel: 'CHAT',
        summary: 'Called back',
      }).success,
    ).toBe(false);
    expect(
      createInteractionSchema.safeParse({
        branchId: id,
        interactionType: 'NOTE',
        channel: 'CHAT',
        outcome: 'NO_ANSWER',
        summary: 'Called back',
      }).success,
    ).toBe(false);
    expect(
      createInteractionSchema.safeParse({
        branchId: id,
        interactionType: 'FOLLOW_UP',
        channel: 'PHONE',
        outcome: 'PROMISED_RETURN',
        summary: 'Customer promised a return',
      }).success,
    ).toBe(false);
    expect(updateCaseSchema.safeParse({}).success).toBe(false);
  });
});
