import { z } from 'zod';
export const staffIdSchema = z.object({ userId: z.uuid() });
export const staffListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  employmentStatus: z.enum(['ACTIVE', 'ON_LEAVE', 'TERMINATED']).optional(),
  branchId: z.uuid().optional(),
});
export const createStaffSchema = z.object({
  email: z.email(),
  phone: z.string().trim().max(30).optional(),
  displayName: z.string().trim().min(1).max(255),
  employeeCode: z.string().trim().min(2).max(50),
  joinedAt: z.coerce.date(),
  assignments: z
    .array(z.object({ roleId: z.uuid(), branchId: z.uuid().nullable().optional() }))
    .default([]),
});
export const updateStaffSchema = z.object({
  displayName: z.string().trim().min(1).max(255).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  employmentStatus: z.enum(['ACTIVE', 'ON_LEAVE']).optional(),
});
export const assignmentSchema = z.object({
  roleId: z.uuid(),
  branchId: z.uuid().nullable().optional(),
});
export type CreateStaffInput = z.infer<typeof createStaffSchema>;
