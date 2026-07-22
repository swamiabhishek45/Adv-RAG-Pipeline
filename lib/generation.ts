import { AnswerSchema } from "@/lib/schemas";
import { mainModel, structuredCall } from "@/lib/llm";
import { RetrievedDocument } from "@/lib/types";

export async function generateAnswer(question: string, documents: RetrievedDocument[]) {
  return structuredCall({
    model: mainModel(),
    schema: AnswerSchema,
    name: "course_answer",
    system: [
      "Answer the question using only the supplied course subtitle chunks. Follow these guidelines:",
      "1. Rely strictly on the provided chunks. Do not assume or extrapolate. If the chunks do not contain the answer, say that the course subtitles provided do not cover it.",
      "2. Write the answer text as a single clear and concise paragraph.",
      "3. You MUST include inline source citations at the end of the 'answer' string of the JSON response, separated from the explanation paragraph by a blank line (two newlines '\\n\\n').",
      "   Each citation must be enclosed in parentheses and separated by a space, using this exact format:",
      "   (Source X, <Module Name> - <Lesson Name>_epm, Timestamp: <Start MM:SS> -> <End MM:SS>)",
      "   Where:",
      "   - X is the 1-based sequential index of the citation.",
      "   - <Module Name> is the capitalized module name (e.g. 'module 4' becomes 'Module 4').",
      "   - <Lesson Name>_epm is the lesson name derived from the chunk's FilePath by taking the folder name, stripping any leading number prefix (like '1-' or '2-'), and keeping the trailing '_epm' (e.g. from 'class-subtitle/module 4/1-Introduction to Expo Router_epm/...' get 'Introduction to Expo Router_epm').",
      "   - <Start MM:SS> and <End MM:SS> are the start and end timestamps formatted from HH:MM:SS.mmm to MM:SS by removing the hours (if '00') and milliseconds (e.g. '00:01:14.000' becomes '01:14'). If the hour is not '00', keep the hour part.",
      "4. The JSON response must also populate the 'citations' array where each item corresponds to the inline source citations, with the following fields:",
      "   - module: The capitalized module name (e.g., 'Module 4').",
      "   - lesson: The lesson name keeping the '_epm' suffix and removing the number prefix (e.g., 'Introduction to Expo Router_epm').",
      "   - timestamp: The formatted range '<Start MM:SS> -> <End MM:SS>' (e.g., '01:14 -> 01:50').",
      "",
      "Here is an example of the expected 'answer' field structure inside the JSON:",
      "\"Expo Router works as a file-based routing system, where files and folders inside the app directory automatically become routes in the app. Instead of manually defining navigation stacks (as in React Navigation), Expo Router creates routes based on the structure.\\n\\n(Source 1, Module 4 - Introduction to Expo Router_epm, Timestamp: 01:14 -> 01:50) (Source 2, Module 4 - File-Based Routing Basics_epm, Timestamp: 00:00 -> 00:33)\""
    ].join("\n"),
    user: `Question: ${question}\n\nChunks:\n${documents.map(formatDoc).join("\n\n")}`
  });
}

function formatDoc(doc: RetrievedDocument) {
  return [
    `Document ID: ${doc.id}`,
    `Module: ${doc.module_name}`,
    `Lesson: ${doc.lesson_name}`,
    `FilePath: ${doc.source_file_path}`,
    `StartTimestamp: ${doc.start_timestamp}`,
    `EndTimestamp: ${doc.end_timestamp}`,
    `Text: ${doc.text}`
  ].join("\n");
}
