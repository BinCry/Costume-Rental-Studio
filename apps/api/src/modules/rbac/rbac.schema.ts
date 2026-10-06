import { z } from 'zod';
export const roleIdSchema = z.object({ roleId: z.uuid() });
export const roleSchema = z.object({
  roleCode: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .regex(/^[A-Z0-9_]+$/),
  name: z.string().trim().min(1).max(255),
  actorGroup: z.enum(['ADMIN', 'STAFF', 'CUSTOMER']),
  permissionIds: z.array(z.uuid()).default([]),
});
export const permissionsSchema = z.object({ permissionIds: z.array(z.uuid()) });
