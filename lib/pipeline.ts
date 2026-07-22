import { AnswerSchema } from "@/lib/schemas";
import { outputPayloadGuardrails } from "@/lib/guardrails";
import { generateAnswer } from "@/lib/generation";
import { embedText } from "@/lib/llm";
import { vectorSearch } from "@/lib/db";
import { buildQueryVariants } from "@/lib/query-translation";
import { retrieveForVariants } from "@/lib/retrieval";
import { runCorrectiveRag } from "@/lib/corrective-rag";
import { StageLog } from "@/lib/types";

export async function answerBaseline(question: string) {
  const logs: StageLog[] = [];
  const started = Date.now();
  const documents = await vectorSearch(await embedText(question), 5);
  logs.push({ stage: "baseline_retrieval", latencyMs: Date.now() - started });
  const answer = await generateAnswer(question, documents);
  return { ...answer, logs };
}

export async function answerAdvanced(question: string) {
  const logs: StageLog[] = [];
  const translated = await buildQueryVariants(question, logs);
  if (!translated.guard.allowed) {
    return {
      answer: translated.guard.reason ?? "This question cannot be processed.",
      citations: [],
      logs
    };
  }

  const { documents } = await retrieveForVariants(translated.variants, logs);
  const result = await runCorrectiveRag(
    translated.guard.sanitized_query ?? question,
    translated.variants,
    documents,
    logs
  );
  const guarded = outputPayloadGuardrails(result.answer, result.citations);
  const response = AnswerSchema.parse({
    answer: guarded.allowed ? guarded.answer : "The generated response contained sensitive data and was blocked.",
    citations: guarded.allowed ? guarded.citations : []
  });
  console.info(
    JSON.stringify({
      event: "ask_pipeline",
      stages: result.logs ?? logs
    })
  );
  return response;
}
