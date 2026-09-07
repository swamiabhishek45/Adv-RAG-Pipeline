import "dotenv/config";
import { config } from "@/lib/config";
import { ensureSchema, insertChunks, resetCourseTables, upsertLesson } from "@/lib/db";
import { embeddingsModel } from "@/lib/llm";
import { closeQueue, saveRawSubtitleDocument } from "@/lib/queue";
import { chunkCues, findLessonSubtitleFiles, parseSubtitleFile } from "@/lib/subtitles";
import { SubtitleChunk } from "@/lib/types";

async function main() {
  const rootArg = process.argv.find((arg) => arg.startsWith("--root="));
  const dryRun = process.argv.includes("--dry-run");
  const schemaOnly = process.argv.includes("--schema-only");
  const shouldReset = process.argv.includes("--reset");
  const root = rootArg?.slice("--root=".length) || config.subtitleRoot;
  const failed: { file: string; reason: string }[] = [];
  const pendingChunks: { lessonId: string; chunk: SubtitleChunk }[] = [];
  let chunkCount = 0;

  const lessons = await findLessonSubtitleFiles(root);
  const modules = new Set(lessons.map((lesson) => lesson.moduleName));

  if (!dryRun) {
    await ensureSchema();
    if (shouldReset) {
      await resetCourseTables();
    }
  }

  if (schemaOnly) {
    console.log(
      JSON.stringify(
        {
          subtitleRoot: root,
          schemaOnly,
          reset: shouldReset,
          message: "Qdrant collection is ready."
        },
        null,
        2
      )
    );
    await closeQueue().catch(() => undefined);
    return;
  }

  const embeddings = dryRun ? undefined : embeddingsModel();

  for (let lessonIndex = 0; lessonIndex < lessons.length; lessonIndex += 1) {
    const lesson = lessons[lessonIndex];
    try {
      let parsedPath = lesson.filePath;
      let cues = await parseSubtitleFile(lesson.filePath);
      if (cues.length === 0 && lesson.fallbackFilePath) {
        parsedPath = lesson.fallbackFilePath;
        cues = await parseSubtitleFile(lesson.fallbackFilePath);
      }
      const chunks = chunkCues(cues, {
        module_name: lesson.moduleName,
        lesson_name: lesson.lessonName,
        source_file_path: parsedPath
      });
      chunkCount += chunks.length;

      if (dryRun) continue;

      console.log(
        `[parse ${lessonIndex + 1}/${lessons.length}] ${lesson.moduleName} / ${lesson.lessonName}: ${
          chunks.length
        } chunks`
      );

      await saveRawSubtitleDocument({
        module_name: lesson.moduleName,
        lesson_name: lesson.lessonName,
        source_file_path: parsedPath,
        cue_count: cues.length,
        cues
      });
      const lessonId = await upsertLesson(lesson.moduleName, lesson.lessonName, parsedPath);
      pendingChunks.push(...chunks.map((chunk) => ({ lessonId, chunk })));
    } catch (error) {
      failed.push({
        file: lesson.filePath,
        reason: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  if (!dryRun && pendingChunks.length > 0) {
    const batchSize = 100;
    const totalBatches = Math.ceil(pendingChunks.length / batchSize);
    for (let offset = 0; offset < pendingChunks.length; offset += batchSize) {
      const batch = pendingChunks.slice(offset, offset + batchSize);
      console.log(
        `[embed ${Math.floor(offset / batchSize) + 1}/${totalBatches}] chunks ${offset + 1}-${
          offset + batch.length
        } of ${pendingChunks.length}`
      );
      const vectors = await embeddings!.embedDocuments(batch.map((item) => item.chunk.text));
      await insertChunks(
        batch.map((item, index) => ({
          lessonId: item.lessonId,
          chunk: item.chunk,
          embedding: vectors[index]
        }))
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        subtitleRoot: root,
        dryRun,
        totalModules: modules.size,
        totalLessons: lessons.length,
        totalChunksCreated: chunkCount,
        failedFiles: failed
      },
      null,
      2
    )
  );

  if (!dryRun) {
    await closeQueue().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
