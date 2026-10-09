"use client";

import { useRef, useState } from "react";
import { buildChatContext, PageAIContext } from "@/src/library/chatContext";
import { readChatStream } from "@/src/library/chatStream";
import { toolRunningLabel } from "@/src/library/toolActivity";
import { useChatActivity } from "@/src/hooks/useChatActivity";
import { useChatRun } from "@/src/hooks/useChatRun";
import { useChatStatus } from "@/src/library/useChatStatus";
import { getEffectiveModelKey } from "@/src/library/chatMode";
import type { PageTextPageContext } from "@/src/library/Contextual_AI/contextualAi";
import { withTimeZone } from "@/src/library/chatTime";

export type PanelMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  pendingActions?: { id: string; title: string; details: string[] }[];
};

export function useAIPanelChat(userId: string | undefined, email: string | undefined) {
  const [messages, setMessages] = useState<PanelMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const chatStatus = useChatStatus();
  const liveActivity = useChatActivity();
  const chatRun = useChatRun();
  const [errorText, setErrorText] = useState<string | null>(null);
  const nextId = useRef(1);
  const summaryRef = useRef("");
  const summarizedCountRef = useRef(0);

  /** Resolves with whether the student pressed Stop, so the caller can put the question back to re-word. */
  async function sendMessage(text: string, pageContext: PageAIContext | null): Promise<{ stopped: boolean }> {
    if (!text.trim() || isSending) return { stopped: false };

    const userMessage: PanelMessage = { id: nextId.current++, role: "user", text };
    const assistantId = nextId.current++;
    const assistantMessage: PanelMessage = { id: assistantId, role: "assistant", text: "" };
    const nextMessages = [...messages, userMessage];

    setMessages([...nextMessages, assistantMessage]);
    setErrorText(null);
    setIsSending(true);
    chatStatus.connecting();
    liveActivity.reset();
    const { runId, signal } = chatRun.begin();
    let stopped = false;

    function updateAssistant(patch: Partial<PanelMessage>) {
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, ...patch } : m)));
    }

    try {
      const context = userId && email ? await buildChatContext(userId, email) : undefined;

      // Converted to the same PageTextPageContext shape ContextualAiPanel's
      // course/flashcard/quiz-result contexts use — one mechanism for
      // turning page context into prompt text (buildPageContextPrompt in
      // contextualAi.ts) instead of two. ambient:true preserves the old
      // buildPageContextLayer's behavior: never volunteer this unprompted,
      // since it's present in the background on every dashboard page
      // regardless of what the student actually asked about.
      const requestPageContext: PageTextPageContext | undefined = pageContext?.summary
        ? { kind: "page_text", pageTitle: pageContext.label, pageText: pageContext.summary, ambient: true }
        : undefined;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({ role: m.role, content: m.text })),
          context: withTimeZone(context),
          pageContext: requestPageContext,
          summary: summaryRef.current,
          summarizedCount: summarizedCountRef.current,
          currentSessionId: null, // panel conversations are ephemeral, never persisted as a chatMemory session
          ephemeral: true,
          modelKey: getEffectiveModelKey("chat"),
          pendingActionIds: nextMessages.flatMap((m) => m.pendingActions?.map((a) => a.id) ?? []),
          runId,
        }),
        signal,
      });

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Something went wrong.");
      }

      chatStatus.streaming();
      let fullText = "";
      let streamError: string | null = null;

      for await (const event of readChatStream(response)) {
        liveActivity.handle(event);
        if (event.type === "stopped") {
          stopped = true;
        } else if (event.type === "delta") {
          fullText += event.text;
          chatStatus.clear();
          updateAssistant({ text: fullText });
        } else if (event.type === "tool") {
          chatStatus.tool(toolRunningLabel(event.name));
        } else if (event.type === "status") {
          chatStatus.progress(event.label);
        } else if (event.type === "done") {
          if (typeof event.summary === "string") summaryRef.current = event.summary;
          if (typeof event.summarizedCount === "number") summarizedCountRef.current = event.summarizedCount;
          if (event.pendingActions?.length) updateAssistant({ pendingActions: event.pendingActions });
        } else if (event.type === "error") {
          streamError = event.error;
        }
      }

      if (stopped) {
        updateAssistant({ text: fullText ? `${fullText}\n\n_(Stopped)_` : "_(Stopped before the assistant answered.)_" });
      } else if (!fullText) {
        throw new Error(streamError || "The assistant didn't generate a response. Please try again.");
      }
      if (streamError) setErrorText(streamError);
    } catch (error) {
      if (chatRun.wasStopped()) {
        // The connection was cut right after Stop: keep whatever was written.
        setMessages((prev) => prev.filter((m) => !(m.id === assistantId && m.text === "")));
        return { stopped: true };
      }
      console.error("AI panel request failed:", error);
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      setErrorText(error instanceof Error ? error.message : "Couldn't reach the assistant. Please try again.");
    } finally {
      setIsSending(false);
      chatStatus.clear();
      liveActivity.reset();
      chatRun.finish();
    }
    return { stopped };
  }

  return {
    messages,
    isSending,
    toolStatus: chatStatus.status,
    activity: liveActivity.activity,
    errorText,
    sendMessage,
    stop: chatRun.stop,
  };
}
