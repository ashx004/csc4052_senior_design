"use client";

import { useRef, useState } from "react";
import { buildChatContext, PageAIContext } from "@/src/library/chatContext";
import { readChatStream, TOOL_STATUS_LABELS } from "@/src/library/chatStream";
import { useChatStatus } from "@/src/library/useChatStatus";

export type PanelMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
};

export function useAIPanelChat(userId: string | undefined, email: string | undefined) {
  const [messages, setMessages] = useState<PanelMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const chatStatus = useChatStatus();
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
    chatStatus.connecting();

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

      chatStatus.streaming();
      let fullText = "";
      let streamError: string | null = null;

      for await (const event of readChatStream(response)) {
        if (event.type === "delta") {
          fullText += event.text;
          chatStatus.clear();
          updateAssistant({ text: fullText });
        } else if (event.type === "tool") {
          chatStatus.tool(TOOL_STATUS_LABELS[event.name] || "Working on it...");
        } else if (event.type === "status") {
          chatStatus.progress(event.label);
        } else if (event.type === "done") {
          if (typeof event.summary === "string") summaryRef.current = event.summary;
          if (typeof event.summarizedCount === "number") summarizedCountRef.current = event.summarizedCount;
        } else if (event.type === "error") {
          streamError = event.error;
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
      chatStatus.clear();
    }
  }

  return { messages, isSending, toolStatus: chatStatus.status, errorText, sendMessage };
}
