import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().max(255).email();
