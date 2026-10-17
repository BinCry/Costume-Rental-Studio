import { z } from 'zod';

export const knowledgeAnswerInputSchema = z.object({
  query: z.string().trim().min(2).max(1_000),
  topK: z.coerce.number().int().min(1).max(6).default(5),
});

export const knowledgeAnswerSourceSchema = z.object({
  documentId: z.string().min(1),
  heading: z.string(),
  citation: z.string().min(1),
  domain: z.string().min(1),
  status: z.string().min(1),
  businessAuthority: z.boolean(),
});

export const knowledgeAnswerSchema = z.object({
  outcome: z.enum(['answered', 'insufficient_context']),
  answer: z.string(),
  sources: z.array(knowledgeAnswerSourceSchema),
  provisional: z.boolean(),
}).superRefine((answer, context) => {
  if (answer.outcome === 'answered' && answer.sources.length === 0) {
    context.addIssue({
      code: 'custom',
      path: ['sources'],
      message: 'Answered knowledge responses require at least one source',
    });
  }
});

export const aiKnowledgeResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({ result: knowledgeAnswerSchema }),
  message: z.string(),
});

export type KnowledgeAnswerInput = z.infer<typeof knowledgeAnswerInputSchema>;
export type KnowledgeAnswer = z.infer<typeof knowledgeAnswerSchema>;
