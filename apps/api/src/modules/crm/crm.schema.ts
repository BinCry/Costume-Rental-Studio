import { z } from 'zod';

const caseStatus = z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);
const casePriority = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
const interactionType = z.enum(['INQUIRY', 'CONSULTATION', 'COMPLAINT', 'FOLLOW_UP', 'NOTE']);
const interactionChannel = z.enum(['IN_PERSON', 'PHONE', 'EMAIL', 'CHAT', 'SOCIAL']);
const page = z.coerce.number().int().min(1).default(1);
const pageSize = z.coerce.number().int().min(1).max(100).default(20);

export const caseIdSchema = z.object({ caseId: z.uuid() }).strict();
export const customerIdSchema = z.object({ customerUserId: z.uuid() }).strict();

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
    summary: z.string().trim().min(1).max(10_000),
    occurredAt: z.coerce.date().optional(),
  })
  .strict();

export type ListCasesInput = z.infer<typeof listCasesSchema>;
export type CreateCaseInput = z.infer<typeof createCaseSchema>;
export type UpdateCaseInput = z.infer<typeof updateCaseSchema>;
export type AssignCaseInput = z.infer<typeof assignCaseSchema>;
export type ChangeCaseStatusInput = z.infer<typeof changeCaseStatusSchema>;
export type InteractionListInput = z.infer<typeof interactionListSchema>;
export type CreateInteractionInput = z.infer<typeof createInteractionSchema>;
