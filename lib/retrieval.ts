import { RoutingDecisionSchema, SqlQuerySchema } from "@/lib/schemas";
import { embedText, smallModel, structuredCall } from "@/lib/llm";
import { searchLessons, structuredSearch, vectorSearch } from "@/lib/db";
import { QueryVariant, RetrievedDocument, StageLog } from "@/lib/types";
import { timed } from "@/lib/query-translation";

export async function routeVariant(variant: QueryVariant) {
  return structuredCall({
    model: smallModel(),
    schema: RoutingDecisionSchema,
    name: "routing_decision",
    system:
      "Choose sql for questions about modules/lessons/course structure, vector for conceptual content lookup, and both when either could help.",
    user: `Variant kind: ${variant.kind}\nQuery: ${variant.text}`
  });
}

export async function sqlAdapter(variant: QueryVariant): Promise<RetrievedDocument[]> {
  const generated = await structuredCall({
    model: smallModel(),
    schema: SqlQuerySchema,
    name: "subtitle_sql_query",
    system: [
      "Write one safe read-only Postgres SELECT for a course subtitle search.",
      "Available tables:",
      "modules(id, name)",
      "lessons(id, module_id, name, source_file_path)",
      "subtitle_chunks(id, lesson_id, module_name, lesson_name, start_timestamp, end_timestamp, source_file_path, text)",
      "The SELECT must return exactly: id, module_name, lesson_name, start_timestamp, end_timestamp, source_file_path, text, score.",
      "Use ILIKE, to_tsvector/plainto_tsquery, joins, and LIMIT 8 as useful.",
      "Do not write INSERT, UPDATE, DELETE, DDL, comments, multiple statements, or parameter placeholders."
    ].join("\n"),
    user: variant.text
  });

  if (!isSafeStructuredSelect(generated.sql)) {
    return searchLessons(variant.text, 8);
  }

  try {
    return await structuredSearch(generated.sql);
  } catch {
    return searchLessons(variant.text, 8);
  }
}

export async function vectorAdapter(variant: QueryVariant): Promise<RetrievedDocument[]> {
  return vectorSearch(await embedText(variant.text), 8);
}

export async function retrieveForVariants(variants: QueryVariant[], logs: StageLog[]) {
  const lists: RetrievedDocument[][] = [];
  const routing = [];

  for (const variant of variants) {
    const decision = await timed(logs, `route:${variant.kind}`, () => routeVariant(variant));
    routing.push(decision);
    if (decision.route === "sql" || decision.route === "both") {
      lists.push(await timed(logs, `sql:${variant.kind}`, () => sqlAdapter(variant)));
    }
    if (decision.route === "vector" || decision.route === "both") {
      lists.push(await timed(logs, `vector:${variant.kind}`, () => vectorAdapter(variant)));
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

function isSafeStructuredSelect(sql: string) {
  const normalized = sql.trim().replace(/\s+/g, " ").toLowerCase();
  const forbidden = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|execute|call)\b/;
  return (
    normalized.startsWith("select ") &&
    !normalized.includes(";") &&
    !normalized.includes("--") &&
    !normalized.includes("/*") &&
    !normalized.includes("$") &&
    !forbidden.test(normalized)
  );
}
