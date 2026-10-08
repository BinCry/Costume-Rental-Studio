import { z } from 'zod';

export const idSchema = z.object({ id: z.uuid() });
export const listCatalogSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'name', 'modelCode', 'variantCode', 'sizeCode', 'colorCode'])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  categoryId: z.uuid().optional(),
  modelId: z.uuid().optional(),
  sizeCode: z.string().trim().min(1).max(50).optional(),
  colorCode: z.string().trim().min(1).max(50).optional(),
});
export const categorySchema = z.object({
  parentId: z.uuid().nullable().optional(),
  name: z.string().trim().min(1).max(255),
});
export const modelSchema = z.object({
  categoryId: z.uuid(),
  modelCode: z.string().trim().min(2).max(50),
  name: z.string().trim().min(1).max(255),
  shortDescription: z.string().trim().max(500).optional(),
  description: z.string().optional(),
  material: z.string().trim().max(255).optional(),
});
const variantFields = {
  modelId: z.uuid(),
  variantCode: z.string().trim().min(2).max(50),
  sizeCode: z.string().trim().min(1).max(50),
  colorCode: z.string().trim().min(1).max(50),
  editionLabel: z.string().trim().max(100).optional(),
  fitNotes: z.string().optional(),
  dailyRentalPriceVnd: z.coerce.bigint().positive(),
  depositAmountVnd: z.coerce.bigint().nonnegative(),
  replacementValueVnd: z.coerce.bigint().nonnegative(),
  cleaningBufferMinutes: z.coerce.number().int().nonnegative().optional(),
};
export const variantSchema = z
  .object(variantFields)
  .refine((v) => v.replacementValueVnd >= v.depositAmountVnd, {
    message: 'Replacement value must cover deposit',
    path: ['replacementValueVnd'],
  });
export const variantUpdateSchema = z.object({
  modelId: variantFields.modelId.optional(),
  variantCode: variantFields.variantCode.optional(),
  sizeCode: variantFields.sizeCode.optional(),
  colorCode: variantFields.colorCode.optional(),
  editionLabel: variantFields.editionLabel.nullable().optional(),
  fitNotes: variantFields.fitNotes.nullable().optional(),
  dailyRentalPriceVnd: variantFields.dailyRentalPriceVnd.optional(),
  depositAmountVnd: variantFields.depositAmountVnd.optional(),
  replacementValueVnd: variantFields.replacementValueVnd.optional(),
  cleaningBufferMinutes: variantFields.cleaningBufferMinutes.nullable().optional(),
});
export const modelUpdateSchema = modelSchema
  .extend({
    shortDescription: z.string().trim().max(500).nullable().optional(),
    description: z.string().nullable().optional(),
    material: z.string().trim().max(255).nullable().optional(),
  })
  .partial();
export const accessorySchema = z.object({
  name: z.string().trim().min(1).max(255),
  defaultQuantity: z.coerce.number().int().positive().default(1),
  replacementValueVnd: z.coerce.bigint().nonnegative().optional(),
});
export const mediaSchema = z.object({
  uploadKey: z.string().trim().min(1).max(500),
  sortOrder: z.coerce.number().int().nonnegative().default(0),
  altText: z.string().trim().max(500).optional(),
});
export const mediaUpdateSchema = z.object({
  sortOrder: z.coerce.number().int().nonnegative().optional(),
  altText: z.string().trim().max(500).nullable().optional(),
});
export type ListCatalogInput = z.infer<typeof listCatalogSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type ModelInput = z.infer<typeof modelSchema>;
export type ModelUpdateInput = z.infer<typeof modelUpdateSchema>;
export type VariantInput = z.infer<typeof variantSchema>;
export type VariantUpdateInput = z.infer<typeof variantUpdateSchema>;
export type AccessoryInput = z.infer<typeof accessorySchema>;
export type MediaInput = z.infer<typeof mediaSchema>;
export type MediaUpdateInput = z.infer<typeof mediaUpdateSchema>;
