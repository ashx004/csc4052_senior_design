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
  | { type: "tool"; name: string }
  | { type: "status"; label: string }
  | {
      type: "done";
      documentsRead?: string[];
      generatedFiles?: { name: string; url: string }[];
      summary?: string;
      summarizedCount?: number;
    }
  | { type: "error"; error: string };

export const TOOL_STATUS_LABELS: Record<string, string> = {
  search_documents: "Searching your documents...",
  read_document: "Reading a document...",
  web_search: "Searching the web...",
  search_youtube: "Looking for videos...",
  create_pdf: "Creating a PDF...",
  recall_past_chat: "Checking past conversations...",
};

export async function* readChatStream(response: Response): AsyncGenerator<ChatStreamEvent> {
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
