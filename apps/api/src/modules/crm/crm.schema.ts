import { z } from 'zod';

const caseStatus = z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);
const casePriority = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
const interactionType = z.enum(['INQUIRY', 'CONSULTATION', 'COMPLAINT', 'FOLLOW_UP', 'NOTE']);
const interactionChannel = z.enum(['IN_PERSON', 'PHONE', 'EMAIL', 'CHAT', 'SOCIAL']);
export const overdueFollowUpOutcome = z.enum([
  'CONTACTED',
  'PROMISED_RETURN',
  'NO_ANSWER',
  'REFUSED_RETURN',
  'REQUESTED_EXTENSION',
  'OTHER',
]);
const page = z.coerce.number().int().min(1).default(1);
const pageSize = z.coerce.number().int().min(1).max(100).default(20);

export const caseIdSchema = z.object({ caseId: z.uuid() }).strict();
export const customerIdSchema = z.object({ customerUserId: z.uuid() }).strict();
export const assigneesQuerySchema = z.object({ branchId: z.uuid() }).strict();

export const listCasesSchema = z
  .object({
    page,
    pageSize,
    branchId: z.uuid().optional(),
    customerUserId: z.uuid().optional(),
    orderId: z.uuid().optional(),
    ownerUserId: z.uuid().optional(),
    status: caseStatus.optional(),
    priority: casePriority.optional(),
    caseType: z.string().trim().min(1).max(50).optional(),
    overdue: z.coerce.boolean().optional(),
    search: z.string().trim().min(1).max(100).optional(),
    sortBy: z.enum(['createdAt', 'updatedAt', 'dueAt', 'priority']).default('updatedAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();

export const createCaseSchema = z
  .object({
    customerUserId: z.uuid(),
    branchId: z.uuid(),
    orderId: z.uuid().optional(),
    subject: z.string().trim().min(1).max(255),
    description: z.string().trim().min(1).max(10_000).optional(),
    caseType: z.string().trim().min(1).max(50),
    priority: casePriority.default('NORMAL'),
    ownerUserId: z.uuid().optional(),
    dueAt: z.coerce.date().optional(),
    note: z.string().trim().min(1).max(5_000).optional(),
  })
  .strict();

export const updateCaseSchema = z
  .object({
    subject: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().min(1).max(10_000).nullable().optional(),
    caseType: z.string().trim().min(1).max(50).optional(),
    priority: casePriority.optional(),
    dueAt: z.coerce.date().nullable().optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, 'At least one field is required');

export const assignCaseSchema = z
  .object({
    ownerUserId: z.uuid().nullable(),
    note: z.string().trim().min(1).max(5_000).optional(),
  })
  .strict();

export const changeCaseStatusSchema = z
  .object({ status: caseStatus, note: z.string().trim().min(1).max(5_000).optional() })
  .strict();

export const interactionListSchema = z.object({ page, pageSize }).strict();

export const createInteractionSchema = z
  .object({
    branchId: z.uuid(),
    orderId: z.uuid().optional(),
    caseId: z.uuid().optional(),
    interactionType,
    channel: interactionChannel,
    outcome: overdueFollowUpOutcome.optional(),
    summary: z.string().trim().min(1).max(10_000),
    promisedReturnAt: z.coerce.date().optional(),
    nextFollowUpAt: z.coerce.date().optional(),
    occurredAt: z.coerce.date().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.occurredAt && value.occurredAt > new Date()) {
      context.addIssue({
        code: 'custom',
        path: ['occurredAt'],
        message: 'occurredAt cannot be in the future',
      });
    }
    if (value.outcome && value.interactionType !== 'FOLLOW_UP') {
      context.addIssue({
        code: 'custom',
        path: ['outcome'],
        message: 'outcome is only allowed for FOLLOW_UP interactions',
      });
    }
    if (value.nextFollowUpAt && value.interactionType !== 'FOLLOW_UP') {
      context.addIssue({
        code: 'custom',
        path: ['nextFollowUpAt'],
        message: 'nextFollowUpAt is only allowed for FOLLOW_UP interactions',
      });
    }
    if (
      value.outcome &&
      ['NO_ANSWER', 'REQUESTED_EXTENSION', 'REFUSED_RETURN'].includes(value.outcome) &&
      !value.nextFollowUpAt
    ) {
      context.addIssue({
        code: 'custom',
        path: ['nextFollowUpAt'],
        message: `nextFollowUpAt is required for ${value.outcome}`,
      });
    }
    if ((value.outcome || value.promisedReturnAt || value.nextFollowUpAt) && !value.occurredAt) {
      context.addIssue({
        code: 'custom',
        path: ['occurredAt'],
        message: 'occurredAt is required for structured follow-up data',
      });
    }
    if (value.outcome === 'PROMISED_RETURN' && !value.promisedReturnAt) {
      context.addIssue({
        code: 'custom',
        path: ['promisedReturnAt'],
        message: 'promisedReturnAt is required for PROMISED_RETURN',
      });
    }
    if (value.outcome !== 'PROMISED_RETURN' && value.promisedReturnAt) {
      context.addIssue({
        code: 'custom',
        path: ['promisedReturnAt'],
        message: 'promisedReturnAt is only allowed for PROMISED_RETURN',
      });
    }
    if (value.occurredAt && value.promisedReturnAt && value.promisedReturnAt <= value.occurredAt) {
      context.addIssue({
        code: 'custom',
        path: ['promisedReturnAt'],
        message: 'promisedReturnAt must be after occurredAt',
      });
    }
    if (value.occurredAt && value.nextFollowUpAt && value.nextFollowUpAt <= value.occurredAt) {
      context.addIssue({
        code: 'custom',
        path: ['nextFollowUpAt'],
        message: 'nextFollowUpAt must be after occurredAt',
      });
    }
  });

export type ListCasesInput = z.infer<typeof listCasesSchema>;
export type CreateCaseInput = z.infer<typeof createCaseSchema>;
export type UpdateCaseInput = z.infer<typeof updateCaseSchema>;
export type AssignCaseInput = z.infer<typeof assignCaseSchema>;
export type ChangeCaseStatusInput = z.infer<typeof changeCaseStatusSchema>;
export type InteractionListInput = z.infer<typeof interactionListSchema>;
export type CreateInteractionInput = z.infer<typeof createInteractionSchema>;
