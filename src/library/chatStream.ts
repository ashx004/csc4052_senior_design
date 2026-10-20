import { notifyDataChanged } from "./dataChanged";
import { TOOL_LABELS } from "./toolActivity";

// Shared client-side parser for the newline-delimited JSON stream produced
// by POST /api/chat (see the response-protocol comment above the route
// handler in src/app/api/chat/route.ts). Previously duplicated verbatim
// between ai-assistant/page.tsx and aiPanel/useAIPanelChat.ts — the buffer/
// decoder/line-splitting/JSON.parse mechanics now live in exactly one place,
// so a protocol change only needs to happen once. Callers still own their
// own event handling (the full page also tracks documentsRead/
// generatedFiles that the panel doesn't), only the stream-reading mechanics
// were shared.

export type ChatStreamEvent =
  | { type: "delta"; text: string }
  | { type: "tool"; name: string; /** What the tool is working on, e.g. a search query or document name. */ detail?: string }
  | { type: "tool_done"; name: string; ok: boolean }
  /** The model's reasoning, in small pieces, while it works out a reply. */
  | { type: "thinking"; text: string }
  /** A short plain-language summary of the reasoning so far. */
  | { type: "thought_summary"; text: string }
  /**
   * The student pressed Stop; a "done" event with the partial reply follows.
   * `discarded` means nothing had been written yet, so the server removed the
   * whole turn from the saved chat and the client should drop the question too.
   */
  | { type: "stopped"; discarded?: boolean }
  | { type: "status"; label: string }
  | {
      type: "done";
      documentsRead?: string[];
      generatedFiles?: { name: string; url: string }[];
      generatedStudySets?: { kind: "flashcard" | "quiz" | "note"; id: string; courseId: string; name: string }[];
      /** Changes waiting on a Confirm/Cancel card (see pendingActions.ts). */
      pendingActions?: { id: string; title: string; details: string[] }[];
      summary?: string;
      summarizedCount?: number;
      /** What this reply was charged in AI credit (micro-dollars). */
      costMicros?: number;
      /** Which model wrote it, by display name (cloud AI only). */
      model?: string;
    }
  | { type: "error"; error: string }
  // Sent once, only for a brand-new main-assistant session, as soon as the
  // server creates its Firestore doc — lets the client learn the session ID
  // immediately instead of waiting for the reply to finish (see
  // startChatPersistence in api/chat/route.ts).
  | { type: "session"; id: string };

// Kept for the code that still looks labels up by tool name; the labels themselves
// live in toolActivity.ts so the server and every chat surface describe tools the same way.
export const TOOL_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(TOOL_LABELS).map(([name, labels]) => [name, labels.running])
);

// Tools that change data another page may be showing.
const WRITE_TOOL = /^(create|update|delete|edit|organize|set)_/;

export async function* readChatStream(response: Response): AsyncGenerator<ChatStreamEvent> {
  let wrote = false;
  try {
    for await (const event of readChatStreamEvents(response)) {
      if (event.type === "tool" && WRITE_TOOL.test(event.name)) wrote = true;
      yield event;
    }
  } finally {
    if (wrote) notifyDataChanged();
  }
}

async function* readChatStreamEvents(response: Response): AsyncGenerator<ChatStreamEvent> {
  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // keep any incomplete trailing line for the next read

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        yield JSON.parse(trimmed) as ChatStreamEvent;
      } catch {
        continue; // skip a malformed line rather than aborting the whole stream
      }
    }
  }
}
