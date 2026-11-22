import { z } from 'zod';

const reviewContent = z.string().trim().max(3000).nullable().optional();

export const submitReviewSchema = z.object({
  variantId: z.uuid(),
  stars: z.number().int().min(1).max(5),
  content: reviewContent,
  isAnonymous: z.boolean().default(true),
  uploadKeys: z.array(z.string().trim().min(1).max(500)).max(5).default([]),
});

export const updateReviewSchema = z.object({
  stars: z.number().int().min(1).max(5),
  content: reviewContent,
  isAnonymous: z.boolean().default(true),
  keepMediaIds: z.array(z.uuid()).max(5).default([]),
  uploadKeys: z.array(z.string().trim().min(1).max(500)).max(5).default([]),
});

export const reviewListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  sortBy: z.literal('createdAt').default('createdAt'),
  sortOrder: z.literal('desc').default('desc'),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  hasPhotos: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  sort: z.enum(['recent', 'rating-high', 'rating-low']).default('recent'),
});

export const adminReviewListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.literal('createdAt').default('createdAt'),
  sortOrder: z.literal('desc').default('desc'),
  search: z.string().trim().max(100).optional(),
  status: z.enum(['PUBLISHED', 'HIDDEN']).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
});

export const reviewIdSchema = z.object({ reviewId: z.uuid() });
export const reviewOrderIdSchema = z.object({ orderId: z.uuid() });
export const modelIdSchema = z.object({ modelId: z.uuid() });
export const moderateReviewSchema = z.object({
  status: z.enum(['PUBLISHED', 'HIDDEN']),
  note: z.string().trim().max(1000).nullable().optional(),
});

export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;
export type ReviewListInput = z.infer<typeof reviewListSchema>;
export type AdminReviewListInput = z.infer<typeof adminReviewListSchema>;
