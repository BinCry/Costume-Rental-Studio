import { z } from 'zod';

import { allowedImageContentTypes } from '../../common/storage/s3.js';

export const createPresignedUploadSchema = z.object({
  purpose: z.literal('catalog-media'),
  ownerType: z.enum(['model', 'variant']),
  ownerId: z.uuid(),
  contentType: z.enum(allowedImageContentTypes),
  size: z.coerce.number().int().positive(),
});

export type CreatePresignedUploadInput = z.infer<typeof createPresignedUploadSchema>;
