import { Queue } from "bullmq";
import IORedis from "ioredis";
import { config } from "@/lib/config";

let redisConnection: IORedis | undefined;
let logQueue: Queue | undefined;

export function getRedisConnection() {
  if (!redisConnection) {
    redisConnection = new IORedis(config.redisUrl, {
      maxRetriesPerRequest: null // Required by BullMQ
    });
  }
  return redisConnection;
}

export function getLogQueue() {
  if (!logQueue) {
    logQueue = new Queue("course_rag_queue", {
      connection: getRedisConnection()
    });
  }
  return logQueue;
}

export async function saveRawSubtitleDocument(document: unknown) {
  const queue = getLogQueue();
  await queue.add("saveRawSubtitle", document);
}

export async function saveRagTrace(document: unknown) {
  const queue = getLogQueue();
  await queue.add("saveRagTrace", document);
}

export async function closeQueue() {
  if (logQueue) {
    await logQueue.close();
    logQueue = undefined;
  }
  if (redisConnection) {
    redisConnection.disconnect();
    redisConnection = undefined;
  }
}
