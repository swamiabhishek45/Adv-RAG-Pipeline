import path from "node:path";

export const config = {
  openAiApiKey: process.env.OPENAI_API_KEY,
  geminiApiKey: process.env.GEMINI_API_KEY,
  databaseUrl: process.env.DATABASE_URL,
  mongodbUri: process.env.MONGODB_URI,
  subtitleRoot:
    process.env.SUBTITLE_ROOT ??
    (process.env.NODE_ENV === "production"
      ? path.join(process.cwd(), "class-subtitle")
      : path.join(process.cwd(), "..", "class-subtitle", "class-subtitle")),
  mainModel: process.env.OPENAI_MAIN_MODEL ?? "gpt-4o",
  smallModel: process.env.OPENAI_SMALL_MODEL ?? "gpt-4o-mini",
  embeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
  mem0ApiKey: process.env.MEM0_API_KEY
};

export function requireEnv(name: keyof typeof config): string {
  const value = config[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
