import { resolveOllamaBaseUrl } from "./ollamaClient";
import { stripThinkLeak } from "./stripThinkLeak";

// Uses the fast secondary model to restate what a student's raw chat
// message is specifically asking for, before the primary model sees it —
// a form of query rewriting: students often type in shorthand, mid-thought,
// or with implicit context ("that thing from before", "can you check the
// second one"), and a small clarification pass can surface the concrete
// ask more explicitly than the raw text alone. Deliberately conservative:
// fails open (returns null) on any error, on very short messages (not
// enough to meaningfully clarify), or when the model itself reports the
// message is already unambiguous — this is meant to help on genuinely
// vague input, not add noise/latency to every single turn regardless of
// need.
//
// Set ENABLE_QUERY_CLARIFICATION=false to disable outright (e.g. while
// evaluating whether this actually improves answers enough to justify the
// extra secondary-model round-trip before every response).
// Few-shot examples confirmed necessary live: without them, the original
// model here (qwen3:4b) just echoed the raw message back (with an
// introduced typo) instead of clarifying it. With them, it correctly
// clarifies genuinely vague input and correctly says CLEAR on unambiguous
// input. Since swapped to llama3.2:3b (see OLLAMA_CLARIFIER_MODEL below)
// for latency, mainly for speed - qwen3:4b ignored think:false at the
// weights level, forcing a slow reasoning preamble on every call - but
// re-confirmed live on the same test cases including a genuinely ambiguous
// backreference ("the thing we talked about"-style) that was previously
// flagged as a weak spot. Calibration still isn't perfect on either model
// (some harmless over-triggering on already-clear requests), which is why
// the feature stays additive/fail-open rather than replacing the raw
// message, and disableable via ENABLE_QUERY_CLARIFICATION.
const CLARIFIER_SYSTEM_PROMPT = `You clarify a student's raw chat message for an AI tutor. Output ONLY the clarification or the word CLEAR — never a question, never commentary, never repeat the raw message unchanged.

Example 1
Student message: can u check the second one from csc300 again like b4
Your output: The student wants the second document/item in their CSC 300 class checked again, as previously discussed.

Example 2
Student message: What is the capital of France?
Your output: CLEAR

Now do the same for the next student message. Preserve every concrete detail (course codes, document names, exact numbers/wording) — never paraphrase details away or add anything not implied by the message. Do not answer the question yourself.`;

const MIN_MESSAGE_LENGTH = 12; // below this ("hi", "yes", "thanks"), there's nothing to clarify

// Cheap pre-filter before paying the LLM round trip at all: every message
// over MIN_MESSAGE_LENGTH used to hit the clarifier regardless of content,
// even though most messages are already self-contained and the model's own
// most common output is just "CLEAR" for them (confirmed live - it
// over-triggers into calling itself unnecessarily as often as it
// under-triggers into missing real ambiguity). This only looks for the
// specific pattern the clarifier actually exists to catch - a message
// leaning on unstated conversational context ("the other one", "like
// before", "what you said") - not generic pronouns like "it"/"this", which
// are far too common in perfectly self-contained questions to be a useful
// signal on their own. Deliberately conservative in the safe direction:
// when in doubt this still calls the model, it only skips the call when
// there's no signal at all that context-dependence is even plausible.
const AMBIGUITY_SIGNAL = /\b(that one|the other one|the same one|like (i|you) (said|mentioned)|as (i|you) (said|mentioned)|(like |from )?before|again|last time|earlier|previously|we (talked|discussed)|you (said|mentioned|told me)|that thing|the thing (we|you))\b/i;

function mightBeAmbiguous(message: string): boolean {
  return AMBIGUITY_SIGNAL.test(message);
}

// Was 15s — raised after a real timeout was traced to the secondary box
// evicting/reloading whichever of qwen3:4b / qwen3-embedding wasn't most
// recently used (no OLLAMA_MAX_LOADED_MODELS set, so only one stayed
// resident). Fixed at the infra level (both models now kept loaded
// simultaneously, OLLAMA_KEEP_ALIVE=-1) — this extra headroom is just
// defense-in-depth for real concurrent-request queueing, not the reload
// case anymore.
const CLARIFY_TIMEOUT_MS = 20000;

export async function clarifyUserQuery(message: string): Promise<string | null> {
  if (process.env.ENABLE_QUERY_CLARIFICATION === "false") return null;
  if (!process.env.OLLAMA_SECONDARY_URL || !process.env.OLLAMA_AUTH_TOKEN) return null;
  if (message.trim().length < MIN_MESSAGE_LENGTH) return null;
  if (!mightBeAmbiguous(message)) return null;

  try {
    const baseUrl = await resolveOllamaBaseUrl(process.env.OLLAMA_SECONDARY_URL, process.env.OLLAMA_SECONDARY_FALLBACK_URL);
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OLLAMA_AUTH_TOKEN}`,
      },
      signal: AbortSignal.timeout(CLARIFY_TIMEOUT_MS),
      body: JSON.stringify({
        // Deliberately its own env var, not OLLAMA_SUMMARY_MODEL - this task
        // (rewrite a short message using its own words) tolerates a much
        // smaller/faster model than compaction's fact-preservation-heavy
        // summarization does. Confirmed live: llama3.2:3b matches qwen3:4b's
        // clarifications on both the few-shot-covered cases and a genuinely
        // novel ambiguous backreference ("what did you say earlier about
        // the thing with...") at roughly 15-30x lower latency (~150-270ms
        // vs qwen3:4b's multi-second thinking preamble), with none of
        // qwen3:4b's think:false-ignoring slowness since llama3.2 isn't a
        // reasoning-hybrid model at all.
        model: process.env.OLLAMA_CLARIFIER_MODEL || "llama3.2:3b",
        stream: false,
        // Kept for defense-in-depth even though llama3.2:3b actually
        // respects it (unlike the qwen3:4b this replaced) - costs nothing,
        // and stripThinkLeak below still guards any future model swapped in
        // here that doesn't respect it.
        think: false,
        options: { temperature: 0.1 },
        messages: [
          { role: "system", content: CLARIFIER_SYSTEM_PROMPT },
          { role: "user", content: message },
        ],
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const clarified = stripThinkLeak(data?.message?.content || "").trim();
    if (!clarified || clarified.toUpperCase() === "CLEAR") return null;
    return clarified;
  } catch (error) {
    // Log just the message/name, not the raw error object — a DOMException
    // from AbortSignal.timeout() dumps a huge, noisy block of unrelated
    // legacy error-code constants when passed to console.error directly.
    const description = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`Query clarification failed, continuing without it: ${description}`);
    return null;
  }
}
