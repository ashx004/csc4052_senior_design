import { FAST_MODEL_KEEP_ALIVE, mainModelContextOption, resolveModelFromKey } from "./ollamaClient";
import { thinkField } from "./thinkMode";
import { extractFirstJsonObject, stripThinkLeak } from "./stripThinkLeak";

// Both attempts share one deadline. Only malformed model output is repaired;
// timeouts/service errors must not immediately double the load on a busy GPU.
export const GENERATION_DEADLINE_MS = 120_000;

export async function structuredGeneration(options: {
  baseUrl: string;
  modelKey?: string;
  feature: "quiz" | "flashcards";
  messages: { role: string; content: string }[];
  schema: unknown;
  deadline: number;
}): Promise<unknown> {
  const remaining = options.deadline - Date.now();
  if (remaining <= 0) throw new Error("Generation timed out. Please try again when the AI is less busy.");
  const response = await fetch(`${options.baseUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OLLAMA_AUTH_TOKEN}`,
      "X-Catalyst-Feature": options.feature === "quiz" ? "quiz-generation" : "flashcard-generation",
    },
    body: JSON.stringify({
      model: resolveModelFromKey(options.modelKey),
      messages: options.messages,
      stream: false,
      ...thinkField(options.feature),
      format: options.schema,
      keep_alive: FAST_MODEL_KEEP_ALIVE,
      options: { temperature: 0, ...mainModelContextOption() },
    }),
    signal: AbortSignal.timeout(remaining),
  });
  if (!response.ok) throw new Error(`AI generation service returned HTTP ${response.status}.`);
  // The timeout remains active through body consumption, not only headers.
  const data = await response.json();
  if (data?.done_reason === "length") return null;
  try {
    return JSON.parse(extractFirstJsonObject(stripThinkLeak(data?.message?.content ?? "")));
  } catch {
    return null;
  }
}

export function normalizedQuestion(value: string): string {
  // Preserve operators and case: C++, C#, x and X can mean different things.
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().replace(/[?.!]$/, "");
}
