import fs from "node:fs/promises";
import path from "node:path";
import { SubtitleChunk, SubtitleCue } from "@/lib/types";

const TIMESTAMP_RE =
  /(?<start>\d{2}:\d{2}:\d{2}[,.]\d{3})\s+-->\s+(?<end>\d{2}:\d{2}:\d{2}[,.]\d{3})/;

export async function findLessonSubtitleFiles(root: string) {
  const lessons: { moduleName: string; lessonName: string; filePath: string; fallbackFilePath?: string }[] = [];

  async function walk(dir: string, moduleName?: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
    const vtt = files.find((file) => file.toLowerCase().endsWith(".vtt"));
    const srt = files.find((file) => file.toLowerCase().endsWith(".srt"));

    if (moduleName && (vtt || srt)) {
      lessons.push({
        moduleName,
        lessonName: cleanName(path.basename(dir)),
        filePath: path.join(dir, vtt ?? srt!),
        fallbackFilePath: vtt && srt ? path.join(dir, srt) : undefined
      });
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith("__MACOSX")) {
        await walk(path.join(dir, entry.name), moduleName ?? cleanName(entry.name));
      }
    }
  }

  await walk(root);
  return lessons.sort((a, b) => a.filePath.localeCompare(b.filePath, undefined, { numeric: true }));
}

export async function parseSubtitleFile(filePath: string): Promise<SubtitleCue[]> {
  const content = await fs.readFile(filePath, "utf8");
  return parseSubtitle(content);
}

export function parseSubtitle(content: string): SubtitleCue[] {
  const normalized = content.replace(/\r/g, "").replace(/^WEBVTT.*\n+/i, "");
  return normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap((block) => {
      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
      const timeIndex = lines.findIndex((line) => TIMESTAMP_RE.test(line));
      if (timeIndex === -1) return [];
      const match = TIMESTAMP_RE.exec(lines[timeIndex]);
      if (!match?.groups) return [];
      const text = lines
        .slice(timeIndex + 1)
        .join(" ")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!text) return [];
      return [
        {
          start_timestamp: normalizeTimestamp(match.groups.start),
          end_timestamp: normalizeTimestamp(match.groups.end),
          text
        }
      ];
    });
}

export function chunkCues(
  cues: SubtitleCue[],
  metadata: { module_name: string; lesson_name: string; source_file_path: string },
  minSeconds = 30,
  maxSeconds = 60
): SubtitleChunk[] {
  const chunks: SubtitleChunk[] = [];
  let current: SubtitleCue[] = [];

  for (const cue of cues) {
    current.push(cue);
    const duration = secondsBetween(current[0].start_timestamp, cue.end_timestamp);
    const endsSentence = /[.!?]["')\]]?$/.test(cue.text);
    if (duration >= maxSeconds || (duration >= minSeconds && endsSentence)) {
      chunks.push(buildChunk(current, metadata));
      current = [];
    }
  }

  if (current.length > 0) {
    chunks.push(buildChunk(current, metadata));
  }

  return chunks;
}

function buildChunk(
  cues: SubtitleCue[],
  metadata: { module_name: string; lesson_name: string; source_file_path: string }
): SubtitleChunk {
  return {
    ...metadata,
    start_timestamp: cues[0].start_timestamp,
    end_timestamp: cues[cues.length - 1].end_timestamp,
    text: cues.map((cue) => cue.text).join(" ").replace(/\s+/g, " ").trim()
  };
}

export function timestampToSeconds(timestamp: string) {
  const [hh, mm, rest] = timestamp.split(":");
  const [ss, ms = "0"] = rest.split(".");
  return Number(hh) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms) / 1000;
}

function secondsBetween(start: string, end: string) {
  return timestampToSeconds(end) - timestampToSeconds(start);
}

function normalizeTimestamp(timestamp: string) {
  return timestamp.replace(",", ".");
}

function cleanName(name: string) {
  return name.replace(/_epm$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}
