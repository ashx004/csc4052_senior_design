import { resolveOllamaBaseUrl } from "./ollamaClient";

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
// Few-shot examples confirmed necessary live: without them, qwen3:4b just
// echoed the raw message back (with an introduced typo) instead of
// clarifying it. With them, it correctly clarifies genuinely vague input
// and correctly says CLEAR on unambiguous input — though it's not
// perfectly calibrated (confirmed live: it over-triggers on some
// already-clear requests, harmless redundant clarification, and
// occasionally under-triggers on genuinely ambiguous backreferences like
// "the thing we talked about" — a 4B model's judgment on ambiguity has
// real limits). This is why the feature is additive/fail-open rather than
// replacing the raw message, and disableable via ENABLE_QUERY_CLARIFICATION.
const CLARIFIER_SYSTEM_PROMPT = `You clarify a student's raw chat message for an AI tutor. Output ONLY the clarification or the word CLEAR — never a question, never commentary, never repeat the raw message unchanged.

Example 1
Student message: can u check the second one from csc300 again like b4
Your output: The student wants the second document/item in their CSC 300 class checked again, as previously discussed.

Example 2
Student message: What is the capital of France?
Your output: CLEAR

Now do the same for the next student message. Preserve every concrete detail (course codes, document names, exact numbers/wording) — never paraphrase details away or add anything not implied by the message. Do not answer the question yourself.`;

const MIN_MESSAGE_LENGTH = 12; // below this ("hi", "yes", "thanks"), there's nothing to clarify
const CLARIFY_TIMEOUT_MS = 15000;

export async function clarifyUserQuery(message: string): Promise<string | null> {
  if (process.env.ENABLE_QUERY_CLARIFICATION === "false") return null;
  if (!process.env.OLLAMA_SECONDARY_URL || !process.env.OLLAMA_AUTH_TOKEN) return null;
  if (message.trim().length < MIN_MESSAGE_LENGTH) return null;

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
        model: process.env.OLLAMA_SUMMARY_MODEL || "qwen3:4b",
        stream: false,
        options: { temperature: 0.1 },
        messages: [
          { role: "system", content: CLARIFIER_SYSTEM_PROMPT },
          { role: "user", content: message },
        ],
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const clarified = (data?.message?.content || "").trim();
    if (!clarified || clarified.toUpperCase() === "CLEAR") return null;
    return clarified;
  } catch (error) {
    console.error("Query clarification failed, continuing without it:", error);
    return null;
  }
}
