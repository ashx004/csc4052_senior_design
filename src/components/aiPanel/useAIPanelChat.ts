"use client";

import { useRef, useState } from "react";
import { buildChatContext, PageAIContext } from "@/src/library/chatContext";

export type PanelMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
};

const TOOL_STATUS_LABELS: Record<string, string> = {
  search_documents: "Searching your documents...",
  read_document: "Reading a document...",
  web_search: "Searching the web...",
  search_youtube: "Looking for videos...",
  create_pdf: "Creating a PDF...",
  recall_past_chat: "Checking past conversations...",
};

// A small, deliberately separate duplicate of ai-assistant/page.tsx's
// stream-reading loop rather than an immediate shared refactor — this panel
// and the full assistant page need to each work independently first before
// extracting a shared utility, to avoid regression risk to the
// already-tuned main page (see plan's "polish" phase).
export function useAIPanelChat(userId: string | undefined, email: string | undefined) {
  const [messages, setMessages] = useState<PanelMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const nextId = useRef(1);
  const summaryRef = useRef("");
  const summarizedCountRef = useRef(0);

  async function sendMessage(text: string, pageContext: PageAIContext | null) {
    if (!text.trim() || isSending) return;

    const userMessage: PanelMessage = { id: nextId.current++, role: "user", text };
    const assistantId = nextId.current++;
    const assistantMessage: PanelMessage = { id: assistantId, role: "assistant", text: "" };
    const nextMessages = [...messages, userMessage];

    setMessages([...nextMessages, assistantMessage]);
    setErrorText(null);
    setIsSending(true);
    setToolStatus(null);

    function updateAssistant(patch: Partial<PanelMessage>) {
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, ...patch } : m)));
    }

    try {
      const context = userId && email ? { ...(await buildChatContext(userId, email)), pageContext: pageContext ?? undefined } : undefined;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({ role: m.role, content: m.text })),
          context,
          summary: summaryRef.current,
          summarizedCount: summarizedCountRef.current,
          currentSessionId: null, // panel conversations are ephemeral, never persisted as a chatMemory session
        }),
      });

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Something went wrong.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      let streamError: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let event: any;
          try {
            event = JSON.parse(trimmed);
          } catch {
            continue;
          }

          if (event.type === "delta") {
            fullText += event.text;
            setToolStatus(null);
            updateAssistant({ text: fullText });
          } else if (event.type === "tool") {
            setToolStatus(TOOL_STATUS_LABELS[event.name] || "Working on it...");
          } else if (event.type === "done") {
            if (typeof event.summary === "string") summaryRef.current = event.summary;
            if (typeof event.summarizedCount === "number") summarizedCountRef.current = event.summarizedCount;
          } else if (event.type === "error") {
            streamError = event.error;
          }
        }
      }

      if (!fullText) {
        throw new Error(streamError || "The assistant didn't generate a response. Please try again.");
      }
      if (streamError) setErrorText(streamError);
    } catch (error) {
      console.error("AI panel request failed:", error);
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      setErrorText(error instanceof Error ? error.message : "Couldn't reach the assistant. Please try again.");
    } finally {
      setIsSending(false);
      setToolStatus(null);
    }
  }

  return { messages, isSending, toolStatus, errorText, sendMessage };
}
