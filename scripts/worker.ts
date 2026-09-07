import "dotenv/config";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { config } from "../lib/config";

const redisUrl = config.redisUrl ?? "redis://localhost:6379";

console.info(`Starting BullMQ worker connecting to Redis at ${redisUrl}...`);

const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null
});

// A Redis client dedicated to saving our logs/traces
const redisClient = new IORedis(redisUrl);

const worker = new Worker(
  "course_rag_queue",
  async (job) => {
    console.info(`[Job ${job.id}] Processing ${job.name}...`);

    if (job.name === "saveRawSubtitle") {
      const data = job.data as any;
      const filePath = data.source_file_path || "unknown_path";
      // Store in Redis hash: key 'raw_subtitles', field filePath
      await redisClient.hset("raw_subtitles", filePath, JSON.stringify({
        ...data,
        processedAt: new Date().toISOString()
      }));
      console.info(`[Job ${job.id}] Saved raw subtitle document for ${filePath}`);
    } else if (job.name === "saveRagTrace") {
      const data = job.data as any;
      // Store in Redis list: key 'rag_traces'
      await redisClient.rpush("rag_traces", JSON.stringify({
        ...data,
        processedAt: new Date().toISOString()
      }));
      console.info(`[Job ${job.id}] Appended RAG trace for query: "${data.question}"`);
    } else {
      console.warn(`[Job ${job.id}] Unknown job type: ${job.name}`);
    }
  },
  {
    connection,
    concurrency: 5
  }
);

worker.on("completed", (job) => {
  console.info(`[Job ${job.id}] Completed successfully`);
});

worker.on("failed", (job, err) => {
  console.error(`[Job ${job?.id || "unknown"}] Failed with error:`, err);
});

process.on("SIGINT", async () => {
  console.info("Shutting down worker...");
  await worker.close();
  connection.disconnect();
  redisClient.disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.info("Shutting down worker...");
  await worker.close();
  connection.disconnect();
  redisClient.disconnect();
  process.exit(0);
});
