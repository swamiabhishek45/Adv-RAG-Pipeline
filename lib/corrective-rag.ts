import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { ScoreSchema } from "@/lib/schemas";
import { generateAnswer } from "@/lib/generation";
import { smallModel, structuredCall } from "@/lib/llm";
import { retrieveForVariants } from "@/lib/retrieval";
import { QueryVariant, RetrievedDocument, StageLog } from "@/lib/types";
import { saveRagTrace } from "@/lib/queue";

type IterationTrace = {
  iteration: number;
  score: number;
  missing_keywords: string[];
  note: string;
};

const RagState = Annotation.Root({
  question: Annotation<string>,
  variants: Annotation<QueryVariant[]>,
  documents: Annotation<RetrievedDocument[]>,
  answer: Annotation<string>,
  citations: Annotation<{ module: string; lesson: string; timestamp: string }[]>,
  bestAnswer: Annotation<string>,
  bestCitations: Annotation<{ module: string; lesson: string; timestamp: string }[]>,
  bestScore: Annotation<number>,
  retryCount: Annotation<number>,
  missingKeywords: Annotation<string[]>,
  traces: Annotation<IterationTrace[]>({
    reducer: (left, right) => left.concat(right),
    default: () => []
  }),
  logs: Annotation<StageLog[]>({
    reducer: (left, right) => left.concat(right),
    default: () => []
  })
});

export async function runCorrectiveRag(question: string, variants: QueryVariant[], documents: RetrievedDocument[], logs: StageLog[], memories: string[] = []) {
  const graph = new StateGraph(RagState)
    .addNode("generate", async (state) => {
      const started = Date.now();
      const answer = await generateAnswer(state.question, state.documents, memories);
      return {
        answer: answer.answer,
        citations: answer.citations,
        logs: [{ stage: "generate", latencyMs: Date.now() - started }]
      };
    })
    .addNode("score", async (state) => {
      const started = Date.now();
      const score = await structuredCall({
        model: smallModel(),
        schema: ScoreSchema,
        name: "rag_score",
        system:
          "Score how well the answer addresses the question using only the retrieved course evidence. Return missing keywords when score is below 6.",
        user: `Question: ${state.question}\nAnswer: ${state.answer}\nCitations: ${JSON.stringify(state.citations)}`
      });
      const bestScore = Math.max(state.bestScore ?? -1, score.score);
      const isBest = score.score >= (state.bestScore ?? -1);
      return {
        bestScore,
        bestAnswer: isBest ? state.answer : state.bestAnswer,
        bestCitations: isBest ? state.citations : state.bestCitations,
        missingKeywords: score.missing_keywords,
        traces: [
          {
            iteration: state.retryCount,
            score: score.score,
            missing_keywords: score.missing_keywords,
            note: score.note
          }
        ],
        logs: [{ stage: "score", latencyMs: Date.now() - started }]
      };
    })
    .addNode("retrieve_more", async (state) => {
      const nextVariant: QueryVariant = {
        kind: "missing_keywords",
        text: `${state.question} ${state.missingKeywords.join(" ")}`
      };
      const passLogs: StageLog[] = [];
      const { documents: moreDocuments } = await retrieveForVariants([...state.variants, nextVariant], passLogs);
      return {
        variants: [...state.variants, nextVariant],
        documents: moreDocuments,
        retryCount: state.retryCount + 1,
        logs: passLogs
      };
    })
    .addEdge(START, "generate")
    .addEdge("generate", "score")
    .addConditionalEdges("score", (state) => {
      if ((state.bestScore ?? 0) >= 6 || state.retryCount >= 3 || state.missingKeywords.length === 0) {
        return "done";
      }
      return "retry";
    }, {
      retry: "retrieve_more",
      done: END
    })
    .addEdge("retrieve_more", "generate")
    .compile();

  const result = await graph.invoke({
    question,
    variants,
    documents,
    bestAnswer: "",
    bestCitations: [],
    bestScore: -1,
    retryCount: 0,
    missingKeywords: [],
    traces: [],
    logs
  });

  saveRagTrace({
    question,
    traces: result.traces,
    logs: result.logs,
    createdAt: new Date()
  }).catch((error) => {
    console.error("Error saving RAG trace:", error);
  });

  return {
    answer: result.bestAnswer || result.answer,
    citations: result.bestCitations?.length ? result.bestCitations : result.citations,
    traces: result.traces,
    logs: result.logs
  };
}
