"use client";

// src/components/aiAssistant/ContextualAiPanel.tsx
// Reusable right-side Catalyst AI drawer for flashcards and quiz results.
// Renders via portal into document.body so it floats above course layout.

import ThinkingIndicator from "./ThinkingIndicator";
import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Send, Sparkles, Maximize2,Minimize2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { PageContext, SuggestionItem } from "@/src/library/Contextual_AI/contextualAi";
import { useSpeechToText } from "@/src/library/useSpeechToText";
import MicButton from "./MicButton";
import { getPanelChatSession, subscribeToPanelChatSession } from "@/src/library/chatMemory";
import { getEffectiveModelKey } from "@/src/library/chatMode";
import { withTimeZone } from "@/src/library/chatTime";
import QuickActions from "@/src/components/aiAssistant/QuickActions";
import type { ChatClass } from "@/src/library/chatContext";
import { useStickToBottom } from "@/src/hooks/useStickToBottom";
import ConfirmActionCard, { type PendingActionCardData } from "./ConfirmActionCard";
import { notifyDataChanged } from "@/src/library/dataChanged";
import { useChatCommands } from "@/src/hooks/useChatCommands";
import { ChatNotice, MemoryAndCost, SlashMenu, SpeedPicker } from "./ChatControls";
import { memoryFill } from "@/src/library/chatCompactionLimits";
import { useChatBubbleSpace } from "@/src/hooks/useChatBubbleSpace";

// ─── Types ──────────────────────────────────────────────────────

type ChatMessage = {
  role: "user" | "assistant";
  pendingActions?: PendingActionCardData[];
  content: string;
  costMicros?: number;
};

type Props = {
  /** Whether the drawer is open */
  open: boolean;
  /** Close callback */
  onClose: () => void;
  /** Contextual label shown below the header, e.g. "Card 3 of 10 — file.pdf" */
  contextLabel: string;
  /** Three suggestion buttons */
  suggestions: SuggestionItem[];
  /** Current page context sent to /api/chat */
  pageContext: PageContext;
  /** Chat context object (same shape the full AI Assistant sends) */
  chatContext: Record<string, unknown>;
  /**
   * Stable identity for "the conversation about this piece of content"
   * (e.g. `quiz:${quizId}`, `flashcard:${documentId}`) — lets the server
   * persist and later re-serve this conversation under
   * users/{uid}/panelChatSessions/{panelContextKey}, so it survives the
   * user closing the drawer or leaving the page before a reply finishes.
   */
  panelContextKey: string;
  /** Ref to the launcher button, for returning focus on close */
  launcherRef?: React.RefObject<HTMLButtonElement | null>;
};

// ─── Component ──────────────────────────────────────────────────

export default function ContextualAiPanel({
  open,
  onClose,
  contextLabel,
  suggestions,
  pageContext,
  chatContext,
  panelContextKey,
  launcherRef,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const stt = useSpeechToText({ text: input, onText: setInput });
  // Pulled out so callbacks can depend on this one stable function, not the whole object.
  const stopListening = stt.stop;
  const [isStreaming, setIsStreaming] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Which panelContextKey `messages` currently reflects — avoids re-seeding
  // from Firestore (clobbering an in-progress local conversation) every
  // time the drawer is reopened for the same content.
  const loadedKeyRef = useRef<string | null>(null);
  const generatingWatchRef = useRef<(() => void) | null>(null);
  // The conversation's running summary, sent back with every message like the
  // main assistant does; without it a long panel chat was re-summarized
  // (and paid for) on every turn.
  const summaryRef = useRef("");
  const [summarizedCount, setSummarizedCountState] = useState(0);
  const summarizedCountRef = useRef(0);
  const setSummarizedCount = (n: number) => {
    summarizedCountRef.current = n;
    setSummarizedCountState(n);
  };

  const userId = typeof chatContext.userId === "string" ? chatContext.userId : undefined;

  // Seed prior messages for this piece of content the first time the
  // drawer opens for it, and watch live if the server's still generating
  // a reply from before the user last left (e.g. closed the drawer or
  // navigated away mid-answer).
  useEffect(() => {
    if (!open || !userId || !panelContextKey || loadedKeyRef.current === panelContextKey) return;
    loadedKeyRef.current = panelContextKey;

    getPanelChatSession(userId, panelContextKey)
      .then((session) => {
        if (!session || loadedKeyRef.current !== panelContextKey) return;
        setMessages(session.messages.map((m) => ({ role: m.role, content: m.text, pendingActions: m.pendingActions, costMicros: m.costMicros })));
        summaryRef.current = session.summary;
        setSummarizedCount(session.summarizedCount);
        if (session.generating) {
          generatingWatchRef.current = subscribeToPanelChatSession(userId, panelContextKey, (updated) => {
            setMessages(updated.messages.map((m) => ({ role: m.role, content: m.text, pendingActions: m.pendingActions, costMicros: m.costMicros })));
            if (!updated.generating) {
              generatingWatchRef.current?.();
              generatingWatchRef.current = null;
            }
          });
        }
      })
      .catch((error) => console.error("Error loading panel chat session:", error));
  }, [open, userId, panelContextKey]);

  useEffect(() => {
    return () => generatingWatchRef.current?.();
  }, []);

  // Follows new content only while the student is at the bottom.
  const { attach: scrollRef, onScroll: onChatScroll, stick: stickToBottom } = useStickToBottom<HTMLDivElement>([messages, toolStatus]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Escape key closes panel
  useEffect(() => {
    if (!open) return;
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsExpanded(false);
        onClose();
        launcherRef?.current?.focus();
    }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose, launcherRef]);

  // ─── Send Message ───────────────────────────────────────────

  // /compact: summarize all but the last few messages now; the server saves it to this panel's chat.
  async function compactChat(): Promise<string> {
    if (isStreaming) return "Wait for the reply to finish, then try again.";
    if (messages.length < 6) return "This chat is still short; there's nothing to summarize yet.";
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        summary: summaryRef.current,
        summarizedCount: summarizedCountRef.current,
        panelContextKey,
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

  const chatCost = messages.reduce((sum, m) => sum + (m.costMicros ?? 0), 0);
  // No /new or /clear here: this panel's chat is tied to what's on the page and saved on the server.
  const commands = useChatCommands({
    input,
    setInput,
    costMicros: chatCost,
    replies: messages.filter((m) => m.role === "assistant" && m.costMicros).length,
    onCompact: compactChat,
  });

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;
      // Stop dictation first, so late speech results can't refill the
      // input this clears below.
      stopListening();

      // A message the user is actively sending makes this stream
      // authoritative — stop watching a previous resumed-live generation
      // so it can't race the local updates below.
      generatingWatchRef.current?.();
      generatingWatchRef.current = null;

      const userMsg: ChatMessage = { role: "user", content: trimmed };
      const assistantMsg: ChatMessage = { role: "assistant", content: "" };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      stickToBottom();
      setInput("");
      setIsStreaming(true);
      setToolStatus(null);

      // Build the messages array for /api/chat
      const allMessages = [
        ...messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        { role: "user" as const, content: trimmed },
      ];

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: allMessages,
            context: withTimeZone(chatContext),
            pageContext,
            panelContextKey,
            summary: summaryRef.current,
            summarizedCount: summarizedCountRef.current,
            modelKey: getEffectiveModelKey("chat"),
            speed: commands.speed,
            pendingActionIds: messages.flatMap((m) => m.pendingActions?.map((a) => a.id) ?? []),
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Request failed" }));
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: `Sorry, something went wrong: ${err.error || res.statusText}`,
            };
            return updated;
          });
          setIsStreaming(false);
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const event = JSON.parse(line);

              if (event.type === "delta" && event.text) {
                setToolStatus(null);
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  updated[updated.length - 1] = {
                    ...last,
                    content: last.content + event.text,
                  };
                  return updated;
                });
              }

              if (event.type === "tool") {
                setToolStatus(
                  event.name === "read_document"
                    ? "Reading document…"
                    : event.name === "search_documents"
                      ? "Searching documents…"
                      : event.name === "web_search"
                        ? "Searching the web…"
                        : `Using ${event.name}…`
                );
              }

              if (event.type === "status") {
                setToolStatus(event.label);
              }

              if (event.type === "done") {
                setToolStatus(null);
                notifyDataChanged();
                if (typeof event.summary === "string") summaryRef.current = event.summary;
                if (typeof event.summarizedCount === "number") setSummarizedCount(event.summarizedCount);
                if (typeof event.costMicros === "number" && event.costMicros > 0) {
                  const cost = event.costMicros;
                  setMessages((prev) => {
                    const updated = [...prev];
                    updated[updated.length - 1] = { ...updated[updated.length - 1], costMicros: cost };
                    return updated;
                  });
                }
                if (event.pendingActions?.length) {
                  setMessages((prev) => {
                    const updated = [...prev];
                    updated[updated.length - 1] = { ...updated[updated.length - 1], pendingActions: event.pendingActions };
                    return updated;
                  });
                }
              }

              if (event.type === "error") {
                setToolStatus(null);
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "assistant",
                    content: event.error || "An error occurred.",
                  };
                  return updated;
                });
              }
            } catch {
              // Skip malformed NDJSON lines
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: "Connection lost. Please try again.",
            };
            return updated;
          });
        }
      } finally {
        setIsStreaming(false);
        setToolStatus(null);
        abortRef.current = null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- commands.speed is read fresh each send
    [messages, isStreaming, chatContext, pageContext, panelContextKey, stopListening, stickToBottom]
  );

  // ─── Handlers ───────────────────────────────────────────────

  // Grow/shrink the textarea whenever its text changes, not only on typing
  // (onInput below) - dictation and sending both set it programmatically.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  const handleSubmit = () => {
    if (commands.runCommand()) return;
    void sendMessage(input);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (commands.handleKeyDown(e)) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleToggleExpanded = () => {
    setIsExpanded((previous) => !previous);
};

    const handleClose = () => {
        setIsExpanded(false);
        onClose();
        launcherRef?.current?.focus();
    };

  // ─── Render ─────────────────────────────────────────────────

  if (!open) return null;

  const panel = (
    <div
      className="fixed inset-0 z-[9999] pointer-events-none"
      aria-modal="false"
    >
      {/* Panel */}
      <div
        ref={panelRef}
        role="complementary"
        aria-label="Catalyst AI assistant"
        className={`
            pointer-events-auto absolute inset-y-0 right-0
            flex flex-col
            bg-bg-container
            transition-[width] duration-300 ease-in-out
            animate-slide-in-right
            ${
                isExpanded
                ? "w-full border-l-0 shadow-none"
                : "w-full border-l border-border-light shadow-[-4px_0_24px_rgba(0,0,0,0.08)] sm:w-[420px]"
            }
        `}
        style={{
          /* Fallback if CSS vars aren't set */
          backgroundColor: "var(--color-bg-container)",
          borderColor: "var(--color-border-light)",
        }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-light">
          <div className="flex min-w-0 items-center gap-2">
            <Sparkles size={24} className="text-primary" />
            <span className="truncate text-xl font-semibold text-text-main">
              C  a  t  a  l  y  s  t  A I .
            </span>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary text-text-inverse opacity-80">
              Beta
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
        <button
            type="button"
            onClick={handleToggleExpanded}
            aria-label={
            isExpanded
                ? "Restore Catalyst panel"
                : "Expand Catalyst panel"
            }
            aria-pressed={isExpanded}
            title={
            isExpanded
                ? "Restore Catalyst panel"
                : "Expand Catalyst panel"
            }
            className="
            hidden items-center justify-center
            rounded-lg p-1.5
            text-text-muted
            transition-colors
            hover:bg-bg-warm
            sm:inline-flex
            "
        >
            {isExpanded ? (
            <Minimize2 size={20} />
            ) : (
            <Maximize2 size={20} />
            )}
        </button>

        <button
            type="button"
            onClick={handleClose}
            aria-label="Close Catalyst panel"
            className="
            rounded-lg p-1.5
            text-text-muted
            transition-colors
            hover:bg-bg-warm
            "
        >
            <ChevronDown size={20} />
        </button>
        </div>
        </div>

        {/* ── Context label ── */}
        <div
            className={`mx-auto w-full px-5 pb-1 pt-3 ${
                isExpanded ? "max-w-4xl" : ""
            }`}
        >
          <p className="text-xs text-text-muted truncate">
            {contextLabel}
          </p>
        </div>

        {/* ── Scrollable body ── */}
        <div
            ref={scrollRef}
            onScroll={onChatScroll}
            className={`mx-auto w-full flex-1 space-y-4 overflow-y-auto px-5 py-3 ${
                isExpanded ? "max-w-4xl" : ""
            }`}
        >
          {/* Initial state: heading + suggestions */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center text-center pt-6 pb-2 space-y-5">
              <h3 className="text-2xl font-semibold text-text-main">
                What would you like explained?
              </h3>
              <p className="text-sm text-text-muted max-w-[280px]">
                Ask about this{" "}
                {pageContext.kind === "flashcard"
                  ? "flashcard or the source document"
                  : "quiz or the topics covered"}
                .
              </p>

              {/* Suggestion buttons */}
              <div className="flex flex-col gap-2.5 w-full max-w-[320px]">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(s.message)}
                    disabled={isStreaming}
                    className="
                      px-4 py-3 rounded-full
                      border border-border-light
                      text-sm text-text-main
                      hover:bg-bg-warm hover:border-primary
                      transition-all duration-200
                      disabled:opacity-50 disabled:cursor-not-allowed
                      text-center
                    "
                  >
                    {s.label === "Why wrong?" ? s.message.split('"')[1]
                      ? `Why is "${s.message.split('"')[1]}" wrong?`
                      : s.label
                    : s.label === "Explain simply" ? "Explain this in simpler words"
                    : s.label === "Real-world example" ? "Give me a real-world example"
                    : s.label === "Key takeaways" ? "What should I remember before moving on?"
                    : s.label === "Why correct?" ? "Why are my answers correct?"
                    : s.label === "Challenge me" ? "Give me harder examples"
                    : s.label === "What's next?" ? "What should I study next?"
                    : s.label === "Review missed" ? `Review the ${pageContext.kind === "quiz_result" ? (pageContext as { questions: { isCorrect: boolean }[] }).questions.filter(q => !q.isCorrect).length : 0} question(s) I missed`
                    : s.message}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chat messages */}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex flex-col gap-2 ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`${isExpanded ? "max-w-3xl": "max-w-[85%]"}
                    rounded-2xl px-4 py-3 text-sm leading-relaxed
                  ${
                    msg.role === "user"
                      ? "bg-primary text-text-inverse rounded-br-md"
                      : "bg-bg-container text-text-main border border-border-light rounded-bl-md"
                  }
                `}
                style={
                  msg.role === "user"
                    ? { backgroundColor: "var(--color-primary)" }
                    : {
                        backgroundColor: "var(--color-bg-container)",
                        borderColor: "var(--color-border-light)",
                      }
                }
              >
                {msg.role === "assistant" && msg.content ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : msg.role === "assistant" && !msg.content && isStreaming && i === messages.length - 1 ? (
                  <ThinkingIndicator status={toolStatus || null} compact />
                ) : (
                  <span>{msg.content}</span>
                )}
              </div>
              {msg.pendingActions?.map((action) => (
                <ConfirmActionCard key={action.id} action={action} compact={!isExpanded} />
              ))}
            </div>
          ))}

          {/* Tool status indicator (while assistant has partial content) */}
          {isStreaming && toolStatus && messages[messages.length - 1]?.content && (
            <div className="pl-1">
              <ThinkingIndicator status={toolStatus} compact />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ── Input bar ── */}
<div className="border-t border-border-light px-4 py-3">
  <div
    className={`relative mx-auto w-full ${
      isExpanded ? "max-w-4xl" : ""
    }`}
  >
    {commands.notice && <ChatNotice onDismiss={commands.dismissNotice}>{commands.notice}</ChatNotice>}
    <SlashMenu items={commands.suggestions} active={commands.activeSuggestion} onPick={commands.pick} />
    <QuickActions
      classes={(Array.isArray((chatContext as { classes?: unknown }).classes) ? (chatContext as { classes: ChatClass[] }).classes : [])}
      defaultCourseId={"courseId" in pageContext ? (pageContext.courseId as string | undefined) : undefined}
      disabled={isStreaming}
      compact={!isExpanded}
      onSend={(prompt) => void sendMessage(prompt)}
      leading={<MemoryAndCost memory={memoryFill(messages, summarizedCount)} summarized={summarizedCount > 0} costMicros={chatCost} cloudAi={commands.cloudAi} onCompact={messages.length ? () => void commands.compact() : undefined} compacting={commands.compacting} />}
      trailing={commands.cloudAi ? <SpeedPicker speed={commands.speed} onSpeed={commands.changeSpeed} /> : null}
    />
    <div
      className="
        flex items-end gap-2
        rounded-2xl
        border border-border-light
        bg-bg-container
        px-4 py-3
        shadow-[0_8px_28px_rgba(0,0,0,0.12)]
        transition-shadow duration-200
        focus-within:shadow-[0_12px_36px_rgba(0,0,0,0.18)]
      "
      style={{
        backgroundColor: "var(--color-bg-container)",
        borderColor: "var(--color-border-light)",
      }}
    >
      <textarea
        ref={inputRef}
        value={input}
        onChange={(e) => {
          // Typing takes over from dictation (see useSpeechToText).
          stt.stop();
          setInput(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        placeholder={stt.listening ? "Listening..." : "Ask your study question, or type /"}
        rows={1}
        disabled={isStreaming}
        className="
          min-h-[24px] max-h-[120px] flex-1
          resize-none bg-transparent
          text-sm text-text-main
          outline-none
          placeholder:text-text-muted
          disabled:opacity-50
        "
        style={{
          height: "auto",
          overflow: "hidden",
        }}
        onInput={(e) => {
          const target = e.target as HTMLTextAreaElement;
          target.style.height = "auto";
          target.style.height = `${Math.min(
            target.scrollHeight,
            120
          )}px`;
        }}
      />

      <MicButton stt={stt} className="h-8 w-8" iconSize={16} disabled={isStreaming} />

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!input.trim() || isStreaming}
        aria-label="Send message"
        className="
          shrink-0 rounded-full
          bg-primary p-2
          text-text-inverse
          transition-opacity
          hover:opacity-90
          disabled:cursor-not-allowed
          disabled:opacity-30
        "
        style={{
          backgroundColor: "var(--color-primary)",
        }}
      >
        <Send size={16} />
      </button>
    </div>

    {stt.error && (
      <p role="status" className="mt-2 text-center text-xs text-alert-error">
        {stt.error}
      </p>
    )}

  </div>
</div>

{/* Close panel */}
</div>

{/* Close fixed portal container */}
</div>
);

return createPortal(panel, document.body);
}

// ─── Floating Launcher Button ─────────────────────────────────
// Exported separately so pages can render it independently.

type LauncherProps = {
  onClick: () => void;
  visible: boolean;
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
};

export function CatalystLauncher({ onClick, visible, buttonRef }: LauncherProps) {
  useChatBubbleSpace(visible);
  if (!visible) return null;

  return createPortal(
    <button
      ref={buttonRef}
      onClick={onClick}
      aria-label="Ask Catalyst AI"
      aria-expanded={false}
      className="
        fixed bottom-6 right-6 z-[9998]
        flex items-center gap-2
        px-5 py-3 rounded-full
        bg-primary text-text-inverse
        shadow-lg hover:shadow-xl
        hover:scale-[1.03] active:scale-[0.98]
        transition-all duration-200
        text-sm font-medium
      "
      style={{ backgroundColor: "var(--color-primary)" }}
    >
      <Sparkles size={16} />
      Ask Catalyst
    </button>,
    document.body
  );
}
