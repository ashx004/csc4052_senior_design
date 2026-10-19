"use client";

import { useRef, useState } from "react";
import { buildChatContext, PageAIContext } from "@/src/library/chatContext";
import { readChatStream } from "@/src/library/chatStream";
import { toolRunningLabel } from "@/src/library/toolActivity";
import { useChatActivity } from "@/src/hooks/useChatActivity";
import { stoppedReplyText } from "@/src/library/stoppedReplies";
import { useChatRun } from "@/src/hooks/useChatRun";
import { useChatStatus } from "@/src/library/useChatStatus";
import { getEffectiveModelKey } from "@/src/library/chatMode";
import type { PageTextPageContext } from "@/src/library/Contextual_AI/contextualAi";
import { withTimeZone } from "@/src/library/chatTime";
import type { ChatSpeed } from "@/src/library/chatSpeed";

export type PanelMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  pendingActions?: { id: string; title: string; details: string[] }[];
  costMicros?: number;
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
  // Mirrors summarizedCountRef for the memory meter.
  const [summarizedCount, setSummarizedCountState] = useState(0);
  const setSummarizedCount = (n: number) => {
    summarizedCountRef.current = n;
    setSummarizedCountState(n);
  };

  /** Resolves with whether the student pressed Stop, so the caller can put the question back to re-word. */
  async function sendMessage(text: string, pageContext: PageAIContext | null, speed?: ChatSpeed): Promise<{ stopped: boolean }> {
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
    let discarded = false;
    let sawText = false;

    // Stop pressed before anything was written: drop the question and the empty
    // reply, and let the caller hand the question back to be re-worded.
    const dropStoppedTurn = () => setMessages((prev) => prev.filter((m) => m.id !== userMessage.id && m.id !== assistantId));

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
          speed,
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
          discarded = Boolean(event.discarded);
        } else if (event.type === "delta") {
          sawText = true;
          fullText += event.text;
          chatStatus.clear();
          updateAssistant({ text: fullText });
        } else if (event.type === "tool") {
          chatStatus.tool(toolRunningLabel(event.name));
        } else if (event.type === "status") {
          chatStatus.progress(event.label);
        } else if (event.type === "done") {
          if (typeof event.summary === "string") summaryRef.current = event.summary;
          if (typeof event.summarizedCount === "number") setSummarizedCount(event.summarizedCount);
          if (event.pendingActions?.length) updateAssistant({ pendingActions: event.pendingActions });
          if (typeof event.costMicros === "number" && event.costMicros > 0) updateAssistant({ costMicros: event.costMicros });
        } else if (event.type === "error") {
          streamError = event.error;
        }
      }

      if (stopped && discarded && !fullText) {
        dropStoppedTurn();
      } else if (stopped) {
        updateAssistant({ text: stoppedReplyText(fullText) });
      } else if (!fullText) {
        throw new Error(streamError || "The assistant didn't generate a response. Please try again.");
      }
      if (streamError) setErrorText(streamError);
    } catch (error) {
      if (chatRun.wasStopped()) {
        // The connection was cut right after Stop: with nothing written drop the
        // turn, otherwise keep whatever was written.
        if (!sawText) dropStoppedTurn();
        else setMessages((prev) => prev.filter((m) => !(m.id === assistantId && m.text === "")));
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

  /** Starts a fresh conversation: drops the messages and the running summary so the context stays short. */
  function clear() {
    if (isSending) return;
    setMessages([]);
    setErrorText(null);
    summaryRef.current = "";
    setSummarizedCount(0);
  }

  /** /compact: summarize all but the last few messages now. Resolves with what to tell the student. */
  async function compact(): Promise<string> {
    if (isSending) return "Wait for the reply to finish, then try again.";
    if (messages.length < 6) return "This chat is still short; there's nothing to summarize yet.";
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: messages.map((m) => ({ role: m.role, content: m.text })),
        summary: summaryRef.current,
        summarizedCount: summarizedCountRef.current,
        ephemeral: true,
        compactOnly: true,
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || "Couldn't summarize right now. Please try again.");
    if (!data.compacted) return "Nothing new to summarize yet.";
    const folded = data.summarizedCount - summarizedCountRef.current;
    summaryRef.current = data.summary;
    setSummarizedCount(data.summarizedCount);
    return `Summarized ${folded} older messages. The assistant still remembers them, in short form.`;
  }

  return {
    messages,
    isSending,
    toolStatus: chatStatus.status,
    activity: liveActivity.activity,
    errorText,
    sendMessage,
    clear,
    compact,
    summarizedCount,
    stop: chatRun.stop,
  };
}
