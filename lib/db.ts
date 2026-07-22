import { Pool } from "pg";
import { config, requireEnv } from "@/lib/config";
import { RetrievedDocument, SubtitleChunk } from "@/lib/types";

let pool: Pool | undefined;

export function getPgPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: requireEnv("databaseUrl"),
      ssl: config.databaseUrl?.includes("localhost") ? false : { rejectUnauthorized: false }
    });
  }
  return pool;
}

export async function ensureSchema() {
  const db = getPgPool();
  await db.query(`CREATE EXTENSION IF NOT EXISTS vector`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS modules (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS lessons (
      id BIGSERIAL PRIMARY KEY,
      module_id BIGINT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      source_file_path TEXT NOT NULL UNIQUE
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS subtitle_chunks (
      id BIGSERIAL PRIMARY KEY,
      lesson_id BIGINT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      module_name TEXT NOT NULL,
      lesson_name TEXT NOT NULL,
      start_timestamp TEXT NOT NULL,
      end_timestamp TEXT NOT NULL,
      source_file_path TEXT NOT NULL,
      text TEXT NOT NULL,
      embedding vector(1536) NOT NULL
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS subtitle_chunks_embedding_idx ON subtitle_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)`);
  await db.query(`CREATE INDEX IF NOT EXISTS lessons_name_idx ON lessons USING gin (to_tsvector('english', name))`);
}

export async function resetCourseTables() {
  await getPgPool().query(`TRUNCATE subtitle_chunks, lessons, modules RESTART IDENTITY CASCADE`);
}

export async function upsertLesson(moduleName: string, lessonName: string, sourceFilePath: string) {
  const db = getPgPool();
  const moduleResult = await db.query<{ id: string }>(
    `INSERT INTO modules(name) VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [moduleName]
  );
  const lessonResult = await db.query<{ id: string }>(
    `INSERT INTO lessons(module_id, name, source_file_path) VALUES ($1, $2, $3)
     ON CONFLICT (source_file_path) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [moduleResult.rows[0].id, lessonName, sourceFilePath]
  );
  return lessonResult.rows[0].id;
}

export async function insertChunk(lessonId: string, chunk: SubtitleChunk, embedding: number[]) {
  await getPgPool().query(
    `INSERT INTO subtitle_chunks
      (lesson_id, module_name, lesson_name, start_timestamp, end_timestamp, source_file_path, text, embedding)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector)`,
    [
      lessonId,
      chunk.module_name,
      chunk.lesson_name,
      chunk.start_timestamp,
      chunk.end_timestamp,
      chunk.source_file_path,
      chunk.text,
      `[${embedding.join(",")}]`
    ]
  );
}

export async function insertChunks(chunks: { lessonId: string; chunk: SubtitleChunk; embedding: number[] }[]) {
  if (chunks.length === 0) return;

  const values: unknown[] = [];
  const placeholders = chunks.map((item, index) => {
    const offset = index * 8;
    values.push(
      item.lessonId,
      item.chunk.module_name,
      item.chunk.lesson_name,
      item.chunk.start_timestamp,
      item.chunk.end_timestamp,
      item.chunk.source_file_path,
      item.chunk.text,
      `[${item.embedding.join(",")}]`
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}::vector)`;
  });

  await getPgPool().query(
    `INSERT INTO subtitle_chunks
      (lesson_id, module_name, lesson_name, start_timestamp, end_timestamp, source_file_path, text, embedding)
     VALUES ${placeholders.join(",")}`,
    values
  );
}

export async function vectorSearch(embedding: number[], limit = 5): Promise<RetrievedDocument[]> {
  const result = await getPgPool().query(
    `SELECT id::text, module_name, lesson_name, start_timestamp, end_timestamp, source_file_path, text,
      1 - (embedding <=> $1::vector) AS score
     FROM subtitle_chunks
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [`[${embedding.join(",")}]`, limit]
  );
  return result.rows.map((row, index) => ({ ...row, rank: index + 1, score: Number(row.score) }));
}

export async function searchLessons(text: string, limit = 8): Promise<RetrievedDocument[]> {
  const result = await getPgPool().query(
    `SELECT c.id::text, c.module_name, c.lesson_name, c.start_timestamp, c.end_timestamp, c.source_file_path, c.text,
      ts_rank(to_tsvector('english', l.name || ' ' || m.name), plainto_tsquery('english', $1)) AS score
     FROM lessons l
     JOIN modules m ON m.id = l.module_id
     JOIN LATERAL (
       SELECT * FROM subtitle_chunks c
       WHERE c.lesson_id = l.id
       ORDER BY c.start_timestamp
       LIMIT 1
     ) c ON true
     WHERE to_tsvector('english', l.name || ' ' || m.name) @@ plainto_tsquery('english', $1)
     ORDER BY score DESC
     LIMIT $2`,
    [text, limit]
  );
  return result.rows.map((row, index) => ({ ...row, rank: index + 1, score: Number(row.score) }));
}

export async function structuredSearch(sql: string): Promise<RetrievedDocument[]> {
  const result = await getPgPool().query(sql);
  return result.rows.map((row, index) => ({
    id: String(row.id),
    module_name: String(row.module_name),
    lesson_name: String(row.lesson_name),
    start_timestamp: String(row.start_timestamp),
    end_timestamp: String(row.end_timestamp),
    source_file_path: String(row.source_file_path),
    text: String(row.text),
    rank: index + 1,
    score: Number(row.score ?? 1 / (index + 1))
  }));
}
