import { RoutingDecisionSchema, KeywordQuerySchema } from "@/lib/schemas";
import { embedText, smallModel, structuredCall } from "@/lib/llm";
import { searchLessons, keywordSearch, vectorSearch } from "@/lib/db";
import { QueryVariant, RetrievedDocument, StageLog } from "@/lib/types";
import { timed } from "@/lib/query-translation";

export async function routeVariant(variant: QueryVariant) {
  return structuredCall({
    model: smallModel(),
    schema: RoutingDecisionSchema,
    name: "routing_decision",
    system:
      "Choose keyword for questions about modules/lessons/course structure, vector for conceptual content lookup, and both when either could help.",
    user: `Variant kind: ${variant.kind}\nQuery: ${variant.text}`
  });
}

export async function keywordAdapter(variant: QueryVariant): Promise<RetrievedDocument[]> {
  try {
    const generated = await structuredCall({
      model: smallModel(),
      schema: KeywordQuerySchema,
      name: "subtitle_keyword_query",
      system: [
        "Create a search query for course subtitles based on the user question.",
        "Output a searchTerm representing the text to match.",
        "Output moduleFilter and/or lessonFilter if the user is asking about a specific module or lesson. Otherwise, leave them blank."
      ].join("\n"),
      user: variant.text
    });

    return await keywordSearch(
      generated.searchTerm,
      generated.moduleFilter || undefined,
      generated.lessonFilter || undefined,
      8
    );
  } catch (error) {
    console.error("Error running keyword adapter, falling back to searchLessons:", error);
    return searchLessons(variant.text, 8);
  }
}

export async function vectorAdapter(variant: QueryVariant): Promise<RetrievedDocument[]> {
  return vectorSearch(await embedText(variant.text), 8);
}

export async function retrieveForVariants(variants: QueryVariant[], logs: StageLog[]) {
  const results = await Promise.all(
    variants.map(async (variant) => {
      const decision = await timed(logs, `route:${variant.kind}`, () => routeVariant(variant));
      const subPromises: Promise<RetrievedDocument[]>[] = [];

      if (decision.route === "keyword" || decision.route === "both") {
        subPromises.push(timed(logs, `keyword:${variant.kind}`, () => keywordAdapter(variant)));
      }
      if (decision.route === "vector" || decision.route === "both") {
        subPromises.push(timed(logs, `vector:${variant.kind}`, () => vectorAdapter(variant)));
      }

      const docsLists = await Promise.all(subPromises);
      return { decision, docsLists };
    })
  );

  const lists: RetrievedDocument[][] = [];
  const routing = [];

  for (const res of results) {
    routing.push(res.decision);
    for (const list of res.docsLists) {
      lists.push(list);
    }
  }

  return { routing, documents: reciprocalRankFusion(lists).slice(0, 5) };
}

export function reciprocalRankFusion(lists: RetrievedDocument[][], k = 60): RetrievedDocument[] {
  const byId = new Map<string, RetrievedDocument & { score: number }>();
  for (const list of lists) {
    list.forEach((doc, index) => {
      const rank = doc.rank ?? index + 1;
      const existing = byId.get(doc.id);
      const increment = 1 / (k + rank);
      if (existing) {
        existing.score += increment;
      } else {
        byId.set(doc.id, { ...doc, score: increment });
      }
    });
  }
  return [...byId.values()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
