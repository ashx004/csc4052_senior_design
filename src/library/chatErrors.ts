// Extracted from api/chat/route.ts for the same reason systemPrompt.ts was —
// Next.js route handler files can only export HTTP method handlers, so this
// couldn't be imported directly for testing while it lived there.
//
// Turns a caught error into a message that actually tells the student what
// kind of failure this was, rather than one generic string for every cause
// — distinguishing "the model is just slow right now" (timeout) from "the
// Ollama backend itself is down/restarting" (a 5xx from callOllama/
// streamOllamaRound's own `Ollama request failed (${status})` throw) from
// anything else. Confirmed live 2026-07-29: the primary box's Ollama
// process was unreachable (its own reverse proxy returned 502) while
// everything else on that machine kept working — from the student's side,
// that previously looked identical to "some ordinary hiccup, just retry,"
// with no way to tell it apart from a real timeout or a one-off glitch.
export function describeChatError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return "The assistant took too long to respond. Please try again.";
    }
    if (/Ollama request failed \(5\d{2}\)/.test(error.message)) {
      return "The AI assistant is temporarily unavailable — please try again in a few minutes.";
    }
  }
  return "Couldn't reach the assistant. Please try again.";
}
