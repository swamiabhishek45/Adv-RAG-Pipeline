export type SubtitleCue = {
  start_timestamp: string;
  end_timestamp: string;
  text: string;
};

export type SubtitleChunk = SubtitleCue & {
  module_name: string;
  lesson_name: string;
  source_file_path: string;
};

export type RetrievedDocument = SubtitleChunk & {
  id: string;
  rank?: number;
  score?: number;
};

export type QueryVariant = {
  kind: "original" | "step_back" | "rewrite" | "sub_question" | "hyde" | "missing_keywords";
  text: string;
};

export type StageLog = {
  stage: string;
  latencyMs: number;
};
