import { z } from 'zod';

export const googleCallbackSchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().min(1).max(100).optional(),
});

export type GoogleCallbackInput = z.infer<typeof googleCallbackSchema>;
