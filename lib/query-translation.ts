import {
  HydeSchema,
  RewriteSchema,
  StepBackSchema,
  SubQuestionsSchema
} from "@/lib/schemas";
import { QueryVariant, StageLog } from "@/lib/types";
import { smallModel, structuredCall } from "@/lib/llm";
import { inputGuardrails } from "@/lib/guardrails";

export async function buildQueryVariants(rawQuery: string, logs: StageLog[], memories: string[] = []) {
  const guardStarted = Date.now();
  const guard = inputGuardrails(rawQuery);
  logs.push({ stage: "input_guardrails", latencyMs: Date.now() - guardStarted });
  if (!guard.allowed) {
    return { guard, variants: [] };
  }

  const query = guard.sanitized_query ?? rawQuery;
  const model = smallModel();
  const variants: QueryVariant[] = [{ kind: "original", text: query }];

  const contextStr = memories.length > 0 ? `[User Context/Preferences: ${memories.join(", ")}]\n` : "";
  const queryWithContext = contextStr ? `${contextStr}Question: ${query}` : query;

  const [stepBack, rewrite, subQuestions, hyde] = await Promise.all([
    timed(logs, "step_back", () =>
      structuredCall({
        model,
        schema: StepBackSchema,
        name: "step_back_query",
        system: "Create a broader conceptual version of a course-search question.",
        user: queryWithContext
      })
    ),
    timed(logs, "rewrite", () =>
      structuredCall({
        model,
        schema: RewriteSchema,
        name: "rewrite_query",
        system: "Fix grammar and spelling only. Preserve the user's meaning exactly.",
        user: queryWithContext
      })
    ),
    timed(logs, "sub_questions", () =>
      structuredCall({
        model,
        schema: SubQuestionsSchema,
        name: "sub_questions",
        system: "Split the course-search question into 2 to 4 focused sub-questions.",
        user: queryWithContext
      })
    ),
    timed(logs, "hyde", () =>
      structuredCall({
        model,
        schema: HydeSchema,
        name: "hyde_answer",
        system: "Write a concise hypothetical answer that might appear in course subtitles.",
        user: queryWithContext
      })
    )
  ]);

  variants.push({ kind: "step_back", text: stepBack.question });
  variants.push({ kind: "rewrite", text: rewrite.query });
  variants.push(...subQuestions.questions.map((text) => ({ kind: "sub_question" as const, text })));
  variants.push({ kind: "hyde", text: hyde.hypothetical_answer });

  return { guard, variants: dedupeVariants(variants) };
}

export async function timed<T>(logs: StageLog[], stage: string, fn: () => Promise<T>) {
  const started = Date.now();
  try {
    return await fn();
  } finally {
    logs.push({ stage, latencyMs: Date.now() - started });
  }
}

function dedupeVariants(variants: QueryVariant[]) {
  const seen = new Set<string>();
  return variants.filter((variant) => {
    const key = variant.text.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
