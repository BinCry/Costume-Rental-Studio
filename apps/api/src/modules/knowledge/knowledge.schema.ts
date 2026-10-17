import { z } from 'zod';

export const knowledgeAnswerInputSchema = z.object({
  query: z.string().trim().min(2).max(1_000),
  topK: z.coerce.number().int().min(1).max(6).default(5),
});

export const knowledgeAnswerSourceSchema = z.object({
  documentId: z.string().catch(''),
  heading: z.string().catch(''),
  citation: z.string().catch(''),
  domain: z.string().catch(''),
  status: z.string().catch(''),
  businessAuthority: z.boolean(),
});

const insufficientEvidenceAnswer =
  'Chưa tìm thấy nguồn trích dẫn hợp lệ để xác nhận câu trả lời. Vui lòng kiểm tra với quản lý hoặc thử lại bằng câu hỏi cụ thể hơn.';

function hasValidEvidenceSource(source: z.infer<typeof knowledgeAnswerSourceSchema>): boolean {
  return [source.documentId, source.heading, source.citation, source.domain, source.status].every(
    (value) => value.trim().length > 0,
  );
}

export const knowledgeAnswerSchema = z.object({
  outcome: z.enum(['answered', 'insufficient_context']),
  answer: z.string(),
  sources: z.array(knowledgeAnswerSourceSchema),
  provisional: z.boolean(),
}).transform((answer) => {
  const normalizedSources = answer.sources.map((source) => ({
    ...source,
    documentId: source.documentId.trim(),
    heading: source.heading.trim(),
    citation: source.citation.trim(),
    domain: source.domain.trim(),
    status: source.status.trim(),
  }));
  const validSources = normalizedSources.filter(hasValidEvidenceSource);
  const hasSufficientEvidence =
    answer.answer.trim().length > 0 &&
    normalizedSources.length > 0 &&
    validSources.length === normalizedSources.length;

  if (answer.outcome === 'answered' && !hasSufficientEvidence) {
    return {
      outcome: 'insufficient_context' as const,
      answer: insufficientEvidenceAnswer,
      sources: [],
      provisional: true,
    };
  }

  return { ...answer, sources: validSources };
});

export const aiKnowledgeResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({ result: knowledgeAnswerSchema }),
  message: z.string(),
});

export type KnowledgeAnswerInput = z.infer<typeof knowledgeAnswerInputSchema>;
export type KnowledgeAnswer = z.infer<typeof knowledgeAnswerSchema>;
