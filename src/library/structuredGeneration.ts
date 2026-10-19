import { FAST_MODEL_KEEP_ALIVE, mainModelContextOption, resolveModelFromKey } from "./ollamaClient";
import { thinkField } from "./thinkMode";
import { currentChatStopSignal } from "./chatRuns";
import { extractFirstJsonObject, stripThinkLeak } from "./stripThinkLeak";
import { aiFetch } from "@/src/library/ai/aiFetch";

// Both attempts share one deadline. Only malformed model output is repaired;
// timeouts/service errors must not immediately double the load on a busy GPU.
export const GENERATION_DEADLINE_MS = 120_000;

export async function structuredGeneration(options: {
  baseUrl: string;
  modelKey?: string;
  feature: "quiz" | "flashcards" | "practice";
  messages: { role: string; content: string }[];
  schema: unknown;
  deadline: number;
}): Promise<unknown> {
  const stopSignal = currentChatStopSignal();

  async function request(format: unknown): Promise<Response> {
    const remaining = options.deadline - Date.now();
    if (remaining <= 0) throw new Error("Generation timed out. Please try again when the AI is less busy.");
    return aiFetch(`${options.baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OLLAMA_AUTH_TOKEN}`,
        "X-Catalyst-Feature": options.feature === "quiz" ? "quiz-generation" : options.feature === "practice" ? "practice-generation" : "flashcard-generation",
      },
      body: JSON.stringify({
        model: resolveModelFromKey(options.modelKey),
        messages: options.messages,
        stream: false,
        // Practice sets are generated the same way as quizzes, so they share its think setting.
        ...thinkField(options.feature === "practice" ? "quiz" : options.feature),
        format,
        keep_alive: FAST_MODEL_KEEP_ALIVE,
        options: { temperature: 0, ...mainModelContextOption() },
      }),
      // Inside a chat reply, the Stop button also ends this call.
      signal: stopSignal ? AbortSignal.any([AbortSignal.timeout(remaining), stopSignal]) : AbortSignal.timeout(remaining),
    });
  }

  // A JSON schema `format` together with think:false can crash the model's
  // runner on some Ollama builds (ollama/ollama#17434). That shows up as an
  // HTTP 500 saying the runner stopped, or as a dropped connection. Plain JSON
  // mode doesn't hit it, and every caller checks the result against its own
  // schema, so one retry in JSON mode turns a crash into a slightly less
  // constrained answer instead of a failure. Nothing else is retried: a busy
  // or overloaded service (429/503, other 500s) and timeouts must not get a
  // second request on top of the first, and Stop is never retried.
  let response: Response | null = null;
  try {
    response = await request(options.schema);
  } catch (error) {
    if (!isConnectionFailure(error, stopSignal)) throw error;
    console.warn("Structured generation connection failed; retrying once in JSON mode:", error);
  }
  if (response && response.status === 500 && RUNNER_CRASH.test(await response.clone().text().catch(() => ""))) {
    console.warn("The model runner crashed on a schema-constrained request; retrying once in JSON mode.");
    response = null;
  }
  if (!response) response = await request("json");
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

/** What Ollama says when the runner process died under a request. */
const RUNNER_CRASH = /runner (process )?(has )?(unexpectedly )?(stopped|terminated|crashed)|exit status|terminated unexpectedly/i;

/** A refused/reset connection (not a timeout, and not the student pressing Stop). */
function isConnectionFailure(error: unknown, stopSignal: AbortSignal | undefined): boolean {
  if (stopSignal?.aborted) return false;
  if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) return false;
  return error instanceof TypeError; // what fetch throws for "fetch failed" / ECONNRESET
}

export function normalizedQuestion(value: string): string {
  // Preserve operators and case: C++, C#, x and X can mean different things.
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().replace(/[?.!]$/, "");
}
