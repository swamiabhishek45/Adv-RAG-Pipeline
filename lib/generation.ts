import { AnswerSchema } from "@/lib/schemas";
import { mainModel, structuredCall } from "@/lib/llm";
import { RetrievedDocument } from "@/lib/types";

export async function generateAnswer(question: string, documents: RetrievedDocument[]) {
  return structuredCall({
    model: mainModel(),
    schema: AnswerSchema,
    name: "course_answer",
    system:
      "Answer using only the supplied course subtitle chunks. Cite lesson_name and start_timestamp for every claim. If the chunks do not contain the answer, say the course subtitles provided do not cover it.",
    user: `Question: ${question}\n\nChunks:\n${documents.map(formatDoc).join("\n\n")}`
  });
}

function formatDoc(doc: RetrievedDocument) {
  return [
    `Document ID: ${doc.id}`,
    `Module: ${doc.module_name}`,
    `Lesson: ${doc.lesson_name}`,
    `Timestamp: ${doc.start_timestamp}`,
    `Text: ${doc.text}`
  ].join("\n");
}
