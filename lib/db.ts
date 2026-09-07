import { QdrantClient } from "@qdrant/js-client-rest";
import crypto from "node:crypto";
import { config } from "@/lib/config";
import { RetrievedDocument, SubtitleChunk } from "@/lib/types";

let client: QdrantClient | undefined;

export const COLLECTION_NAME = "subtitle_chunks";

export function getQdrantClient() {
  if (!client) {
    client = new QdrantClient({
      url: config.qdrantUrl,
      apiKey: config.qdrantApiKey || undefined
    });
  }
  return client;
}

export async function ensureSchema() {
  const qdrant = getQdrantClient();
  const collections = await qdrant.getCollections();
  const exists = collections.collections.some((c) => c.name === COLLECTION_NAME);

  if (!exists) {
    // Create the collection with a vector dimension of 1536
    await qdrant.createCollection(COLLECTION_NAME, {
      vectors: {
        size: 1536,
        distance: "Cosine"
      }
    });

    // Create payload indexes for fast filtering and keyword text search
    await qdrant.createPayloadIndex(COLLECTION_NAME, {
      field_name: "text",
      field_schema: "text"
    });
    await qdrant.createPayloadIndex(COLLECTION_NAME, {
      field_name: "module_name",
      field_schema: "keyword"
    });
    await qdrant.createPayloadIndex(COLLECTION_NAME, {
      field_name: "lesson_name",
      field_schema: "keyword"
    });
  }
}

export async function resetCourseTables() {
  const qdrant = getQdrantClient();
  try {
    await qdrant.deleteCollection(COLLECTION_NAME);
  } catch {
    // Ignore error if collection does not exist
  }
  await ensureSchema();
}

export async function upsertLesson(moduleName: string, lessonName: string, sourceFilePath: string): Promise<string> {
  // Generate a stable lesson UUID from the source file path
  const hash = crypto.createHash("md5").update(sourceFilePath).digest("hex");
  const uuid = [
    hash.substring(0, 8),
    hash.substring(8, 12),
    hash.substring(12, 16),
    hash.substring(16, 20),
    hash.substring(20, 32)
  ].join("-");
  return uuid;
}

export async function insertChunk(lessonId: string, chunk: SubtitleChunk, embedding: number[]) {
  await insertChunks([{ lessonId, chunk, embedding }]);
}

export async function insertChunks(chunks: { lessonId: string; chunk: SubtitleChunk; embedding: number[] }[]) {
  if (chunks.length === 0) return;

  const qdrant = getQdrantClient();
  const points = chunks.map((item) => {
    // Generate a random UUID for each chunk point
    const id = crypto.randomUUID();
    return {
      id,
      vector: item.embedding,
      payload: {
        lesson_id: item.lessonId,
        module_name: item.chunk.module_name,
        lesson_name: item.chunk.lesson_name,
        start_timestamp: item.chunk.start_timestamp,
        end_timestamp: item.chunk.end_timestamp,
        source_file_path: item.chunk.source_file_path,
        text: item.chunk.text
      }
    };
  });

  await qdrant.upsert(COLLECTION_NAME, {
    wait: true,
    points
  });
}

export async function vectorSearch(embedding: number[], limit = 5): Promise<RetrievedDocument[]> {
  const qdrant = getQdrantClient();
  const results = await qdrant.search(COLLECTION_NAME, {
    vector: embedding,
    limit,
    with_payload: true
  });

  return results.map((row, index) => ({
    id: String(row.id),
    module_name: String(row.payload?.module_name ?? ""),
    lesson_name: String(row.payload?.lesson_name ?? ""),
    start_timestamp: String(row.payload?.start_timestamp ?? ""),
    end_timestamp: String(row.payload?.end_timestamp ?? ""),
    source_file_path: String(row.payload?.source_file_path ?? ""),
    text: String(row.payload?.text ?? ""),
    rank: index + 1,
    score: row.score
  }));
}

export async function searchLessons(text: string, limit = 8): Promise<RetrievedDocument[]> {
  const qdrant = getQdrantClient();

  const results = await qdrant.scroll(COLLECTION_NAME, {
    filter: {
      should: [
        { key: "lesson_name", match: { text } },
        { key: "module_name", match: { text } }
      ]
    },
    limit,
    with_payload: true
  });

  return results.points.map((row, index) => ({
    id: String(row.id),
    module_name: String(row.payload?.module_name ?? ""),
    lesson_name: String(row.payload?.lesson_name ?? ""),
    start_timestamp: String(row.payload?.start_timestamp ?? ""),
    end_timestamp: String(row.payload?.end_timestamp ?? ""),
    source_file_path: String(row.payload?.source_file_path ?? ""),
    text: String(row.payload?.text ?? ""),
    rank: index + 1,
    score: 1 / (index + 1)
  }));
}

export async function keywordSearch(
  searchTerm: string,
  moduleFilter?: string,
  lessonFilter?: string,
  limit = 8
): Promise<RetrievedDocument[]> {
  const qdrant = getQdrantClient();
  const mustConditions: any[] = [];

  if (moduleFilter) {
    mustConditions.push({
      key: "module_name",
      match: { value: moduleFilter }
    });
  }

  if (lessonFilter) {
    mustConditions.push({
      key: "lesson_name",
      match: { value: lessonFilter }
    });
  }

  if (searchTerm) {
    mustConditions.push({
      key: "text",
      match: { text: searchTerm }
    });
  }

  const results = await qdrant.scroll(COLLECTION_NAME, {
    filter: mustConditions.length > 0 ? { must: mustConditions } : undefined,
    limit,
    with_payload: true
  });

  return results.points.map((row, index) => ({
    id: String(row.id),
    module_name: String(row.payload?.module_name ?? ""),
    lesson_name: String(row.payload?.lesson_name ?? ""),
    start_timestamp: String(row.payload?.start_timestamp ?? ""),
    end_timestamp: String(row.payload?.end_timestamp ?? ""),
    source_file_path: String(row.payload?.source_file_path ?? ""),
    text: String(row.payload?.text ?? ""),
    rank: index + 1,
    score: 1 / (index + 1)
  }));
}
