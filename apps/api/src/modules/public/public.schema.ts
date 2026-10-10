import { z } from 'zod';

export const publicBranchListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  sortBy: z.enum(['branchCode', 'name', 'createdAt', 'updatedAt']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const publicCatalogListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  categoryId: z.uuid().optional(),
  modelId: z.uuid().optional(),
  sizeCode: z.string().trim().min(1).max(50).optional(),
  colorCode: z.string().trim().min(1).max(50).optional(),
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'name', 'modelCode', 'variantCode', 'sizeCode', 'colorCode'])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const publicResourceIdSchema = z.object({ id: z.uuid() });
export const publicAvailabilitySchema = z
  .object({
    variantId: z.uuid(),
    pickupBranchId: z.uuid(),
    plannedStartAt: z.coerce.date(),
    plannedDueAt: z.coerce.date(),
  })
  .refine((value) => value.plannedDueAt > value.plannedStartAt, {
    path: ['plannedDueAt'],
    message: 'plannedDueAt must be after plannedStartAt',
  });

export type PublicBranchListInput = z.infer<typeof publicBranchListSchema>;
export type PublicCatalogListInput = z.infer<typeof publicCatalogListSchema>;
export type PublicAvailabilityInput = z.infer<typeof publicAvailabilitySchema>;
