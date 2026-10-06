import { z } from 'zod';

const timezone = z.string().trim().min(1).max(100).default('Asia/Ho_Chi_Minh');

export const branchIdSchema = z.object({ branchId: z.uuid() });
export const branchListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  sortBy: z.string().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export const createBranchSchema = z.object({
  branchCode: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .regex(/^[A-Za-z0-9-]+$/),
  name: z.string().trim().min(1).max(255),
  address: z.string().trim().min(1),
  phone: z.string().trim().max(30).optional(),
  timezone,
});
export const updateBranchSchema = createBranchSchema.partial().omit({ branchCode: true });
export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
