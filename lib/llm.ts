import { z } from "zod";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { config } from "@/lib/config";

export function mainModel() {
  return new ChatOpenAI({
    apiKey: config.openAiApiKey,
    model: config.mainModel,
    temperature: 0.1
  });
}

export function smallModel() {
  return new ChatOpenAI({
    apiKey: config.openAiApiKey,
    model: config.smallModel,
    temperature: 0
  });
}

export function embeddingsModel() {
  return new OpenAIEmbeddings({
    apiKey: config.openAiApiKey,
    model: config.embeddingModel
  });
}

export async function embedText(text: string) {
  return embeddingsModel().embedQuery(text);
}

export async function structuredCall<T extends z.ZodTypeAny>(args: {
  model: ReturnType<typeof mainModel>;
  schema: T;
  name: string;
  system: string;
  user: string;
}): Promise<z.infer<T>> {
  const runnable = args.model.withStructuredOutput(args.schema, { name: args.name });
  try {
    return args.schema.parse(await runnable.invoke([
      ["system", args.system],
      ["human", args.user]
    ]));
  } catch {
    return args.schema.parse(
      await runnable.invoke([
        ["system", `${args.system}\nReturn only data that exactly matches the requested schema.`],
        ["human", args.user]
      ])
    );
  }
}
