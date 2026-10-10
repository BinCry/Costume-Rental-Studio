import { z } from 'zod';
import { emailSchema } from '../../common/validation/email.js';
import { phoneSchema } from '../../common/validation/phone.js';

const measurement = z.number().positive().max(999.99).optional();

export const createCustomerSchema = z
  .object({
    branchId: z.uuid(),
    displayName: z.string().trim().min(1).max(255),
    phone: phoneSchema,
    email: emailSchema,
    birthday: z.iso
      .date()
      .refine(
        (value) => value <= new Date().toISOString().slice(0, 10),
        'Birthday cannot be in the future',
      )
      .optional(),
    heightCm: measurement,
    weightKg: measurement,
    chestCm: measurement,
    waistCm: measurement,
    hipCm: measurement,
    internalNote: z.string().trim().max(5000).optional(),
  })
  .strict();

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const customerIdSchema = z.object({ userId: z.uuid() });
export const customerListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  branchId: z.uuid().optional(),
});
export const updateCustomerSchema = z
  .object({
    displayName: z.string().trim().min(1).max(255).optional(),
    email: emailSchema.optional(),
    preferredBranchId: z.uuid().nullable().optional(),
    birthday: z.iso
      .date()
      .refine(
        (value) => value <= new Date().toISOString().slice(0, 10),
        'Birthday cannot be in the future',
      )
      .nullable()
      .optional(),
    heightCm: measurement.nullable().optional(),
    weightKg: measurement.nullable().optional(),
    chestCm: measurement.nullable().optional(),
    waistCm: measurement.nullable().optional(),
    hipCm: measurement.nullable().optional(),
    internalNote: z.string().trim().max(5000).nullable().optional(),
  })
  .strict();
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export const updateOwnCustomerSchema = updateCustomerSchema.omit({ internalNote: true });
export type UpdateOwnCustomerInput = z.infer<typeof updateOwnCustomerSchema>;
