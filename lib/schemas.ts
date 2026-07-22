import { z } from "zod";

export const CitationSchema = z.object({
  module: z.string().min(1),
  lesson: z.string().min(1),
  timestamp: z.string().min(1)
});

export const AnswerSchema = z.object({
  answer: z.string().min(1),
  citations: z.array(CitationSchema)
});

export type Citation = z.infer<typeof CitationSchema>;
export type Answer = z.infer<typeof AnswerSchema>;

export const GuardrailResultSchema = z.object({
  allowed: z.boolean(),
  reason: z.string().optional(),
  sanitized_query: z.string().optional()
});

export type GuardrailResult = z.infer<typeof GuardrailResultSchema>;

export const StepBackSchema = z.object({ question: z.string().min(1) });
export const RewriteSchema = z.object({ query: z.string().min(1) });
export const SubQuestionsSchema = z.object({
  questions: z.array(z.string().min(1)).min(2).max(4)
});
export const HydeSchema = z.object({ hypothetical_answer: z.string().min(1) });

export const RoutingDecisionSchema = z.object({
  query: z.string().min(1),
  route: z.enum(["sql", "vector", "both"]),
  reason: z.string().min(1)
});

export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;

export const SqlQuerySchema = z.object({
  sql: z.string().min(1),
  reason: z.string().min(1)
});

export type SqlQuery = z.infer<typeof SqlQuerySchema>;

export const ScoreSchema = z.object({
  score: z.number().min(0).max(10),
  missing_keywords: z.array(z.string()).default([]),
  note: z.string().min(1)
});

export type ScoreResult = z.infer<typeof ScoreSchema>;
