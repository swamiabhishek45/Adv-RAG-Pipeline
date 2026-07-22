import { MongoClient } from "mongodb";
import { config } from "@/lib/config";

let client: MongoClient | undefined;

async function getMongoClient() {
  if (!config.mongodbUri) return undefined;
  if (!client) {
    client = new MongoClient(config.mongodbUri);
    await client.connect();
  }
  return client;
}

export async function saveRawSubtitleDocument(document: unknown) {
  const mongo = await getMongoClient();
  if (!mongo) return;
  await mongo.db("course_rag").collection("raw_subtitles").insertOne(document as object);
}

export async function saveRagTrace(document: unknown) {
  const mongo = await getMongoClient();
  if (!mongo) return;
  await mongo.db("course_rag").collection("rag_traces").insertOne(document as object);
}

export async function closeMongoClient() {
  if (!client) return;
  await client.close();
  client = undefined;
}
