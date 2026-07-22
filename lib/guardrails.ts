import { GuardrailResult } from "@/lib/schemas";
import { Citation } from "@/lib/schemas";

const profanity = /\b(fuck|shit|bitch|asshole|bastard)\b/i;
const jailbreak = /\b(ignore previous|developer mode|system prompt|jailbreak|bypass instructions)\b/i;
const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const phone = /\b(?:\+?\d[\s.-]?){10,}\b/;
const competitors = /\b(coursera|pluralsight|linkedin learning|edx|skillshare)\b/i;

export function inputGuardrails(query: string): GuardrailResult {
  const trimmed = query.trim();
  if (!trimmed) return { allowed: false, reason: "Question is empty." };
  if (jailbreak.test(trimmed)) return { allowed: false, reason: "Jailbreak attempt detected." };
  if (profanity.test(trimmed)) return { allowed: false, reason: "Profanity is not allowed." };
  if (competitors.test(trimmed)) return { allowed: false, reason: "Competitor mentions are not allowed." };

  const sanitized = trimmed.replace(email, "[masked-email]").replace(phone, "[masked-phone]");
  return { allowed: true, sanitized_query: sanitized };
}

export function outputGuardrails(answer: string) {
  const masked = maskSensitiveSpans(answer);
  const compromised = masked.replace(/\s+/g, " ").trim() === "[masked-secret]";
  return { allowed: !compromised, masked };
}

export function outputPayloadGuardrails(answer: string, citations: Citation[]) {
  const guarded = outputGuardrails(answer);
  return {
    allowed: guarded.allowed,
    answer: guarded.masked,
    citations: citations.map((citation) => ({
      module: maskSensitiveSpans(citation.module),
      lesson: maskSensitiveSpans(citation.lesson),
      timestamp: maskSensitiveSpans(citation.timestamp)
    }))
  };
}

function maskSensitiveSpans(value: string) {
  return value
    .replace(email, "[masked-email]")
    .replace(phone, "[masked-phone]")
    .replace(/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{20,}\b/g, "[masked-secret]")
    .replace(/\b[A-Fa-f0-9]{24}\b/g, "[masked-id]");
}
