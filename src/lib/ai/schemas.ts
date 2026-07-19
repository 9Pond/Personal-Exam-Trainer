import { z } from "zod";

export const ChoiceSchema = z.object({
  label: z.enum(["A", "B", "C", "D"]),
  content: z.string().min(1),
});

export const ExplanationSchema = z.object({
  reasoning: z.string().min(1),
  concept: z.string().min(1),
});

// กรณีมีเฉลยต้นฉบับ (ไม่ต้องมี confidence)
export const QuestionWithAnswerKeySchema = z.object({
  content: z.string().min(1),
  choices: z.array(ChoiceSchema).length(4),
  correct_label: z.enum(["A", "B", "C", "D"]),
  topic: z.string().min(1),
  difficulty: z.enum(["easy", "medium", "hard"]),
  explanation: ExplanationSchema,
  ocr_uncertain: z.boolean(),
});

export const ExtractionWithAnswerKeyResponseSchema = z.object({
  questions: z.array(QuestionWithAnswerKeySchema),
});

// กรณีไม่มีเฉลย — ต้องมี confidence
export const QuestionWithoutAnswerKeySchema = QuestionWithAnswerKeySchema.extend({
  confidence: z.number().min(0).max(1),
});

export const ExtractionWithoutAnswerKeyResponseSchema = z.object({
  questions: z.array(QuestionWithoutAnswerKeySchema),
});

export type QuestionWithAnswerKey = z.infer<typeof QuestionWithAnswerKeySchema>;
export type QuestionWithoutAnswerKey = z.infer<typeof QuestionWithoutAnswerKeySchema>;

// Performance analysis
export const PerformanceAnalysisResponseSchema = z.object({
  overall_summary: z.string().min(1),
  weak_topics: z.array(z.object({ topic: z.string(), percentage: z.number() })),
  strong_topics: z.array(z.object({ topic: z.string(), percentage: z.number() })),
  recommendation: z.string().min(1),
});
