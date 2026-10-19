import { resolveOllamaBaseUrl, secondaryContextOption } from "./ollamaClient";
import { stripThinkLeak } from "./stripThinkLeak";
import { aiFetch } from "@/src/library/ai/aiFetch";

// Turns a slice of the main model's private reasoning into one short status
// line ("Comparing the two syllabi for overlapping exam dates") using a small
// model on the secondary box, so the student sees friendly progress instead of
// a wall of raw reasoning. Entirely optional: with no model configured, or on
// any failure, the chat just shows the raw reasoning's last sentence instead.

const SUMMARY_TIMEOUT_MS = 6_000;
const MAX_SUMMARY_CHARS = 110;

const SUMMARY_SYSTEM_PROMPT = `You write a one-line progress note for a student while an AI study assistant works on their question.
You are given the assistant's private notes. Describe what it is working on right now.
Rules:
- One short sentence, at most 12 words, present tense, no period needed.
- Say what is being worked out, not the answer itself.
- Never include ID numbers, links, email addresses, or quotes from the notes.
- Plain wording a student would understand. No markdown, no emoji.
Reply with only the sentence.`;

/** Tidies a model's reply into a single short line, or "" if it isn't usable. */
export function cleanThoughtSummary(raw: string): string {
  let line = stripThinkLeak(raw)
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean) ?? "";
  line = line
    .replace(/^[-*•\d.)\s]+/, "")
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (/^(sure|okay|ok|here)\b/i.test(line) && line.includes(":")) line = line.slice(line.indexOf(":") + 1).trim();
  if (!line || /https?:\/\/|@\S+\.\S+/.test(line)) return "";
  if (line.length > MAX_SUMMARY_CHARS) {
    const cut = line.slice(0, MAX_SUMMARY_CHARS);
    line = `${cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : MAX_SUMMARY_CHARS).trimEnd()}…`;
  }
  return line;
}

export function thoughtSummaryModel(): string | null {
  if (process.env.OLLAMA_THOUGHT_SUMMARY === "off") return null;
  return process.env.OLLAMA_THOUGHT_SUMMARY_MODEL || process.env.OLLAMA_CLARIFIER_MODEL || null;
}

/** A summarizer for createThoughtRelay, or undefined when no small model is set up. */
export function thoughtSummarizerFromEnv(): ((recentThoughts: string) => Promise<string | null>) | undefined {
  const model = thoughtSummaryModel();
  if (!model || !process.env.OLLAMA_SECONDARY_URL || !process.env.OLLAMA_AUTH_TOKEN) return undefined;

  return async (recentThoughts: string) => {
    const baseUrl = await resolveOllamaBaseUrl(process.env.OLLAMA_SECONDARY_URL!, process.env.OLLAMA_SECONDARY_FALLBACK_URL);
    const response = await aiFetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OLLAMA_AUTH_TOKEN}`,
        "X-Catalyst-Feature": "thought-summary",
      },
      signal: AbortSignal.timeout(SUMMARY_TIMEOUT_MS),
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        options: { temperature: 0.2, num_predict: 40, ...secondaryContextOption() },
        messages: [
          { role: "system", content: SUMMARY_SYSTEM_PROMPT },
          { role: "user", content: `The assistant's notes so far (most recent last):\n\n${recentThoughts}` },
        ],
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return cleanThoughtSummary(data?.message?.content ?? "") || null;
  };
}
