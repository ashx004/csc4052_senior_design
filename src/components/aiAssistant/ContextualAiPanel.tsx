"use client";

// src/components/aiAssistant/ContextualAiPanel.tsx
// Reusable right-side Catalyst AI drawer for flashcards and quiz results.
// Renders via portal into document.body so it floats above course layout.

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Send, Sparkles, Loader2,Maximize2,Minimize2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { PageContext, SuggestionItem } from "@/src/library/Contextual_AI/contextualAi";

// ─── Types ──────────────────────────────────────────────────────

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
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
  launcherRef,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll on new content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, toolStatus]);

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

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

      const userMsg: ChatMessage = { role: "user", content: trimmed };
      const assistantMsg: ChatMessage = { role: "assistant", content: "" };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
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
            context: chatContext,
            pageContext,
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
    [messages, isStreaming, chatContext, pageContext]
  );

  // ─── Handlers ───────────────────────────────────────────────

  const handleSubmit = () => sendMessage(input);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
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
                  <div className="flex items-center gap-2 text-text-muted">
                    <Loader2 size={14} className="animate-spin" />
                    <span className="text-xs">
                      {toolStatus || "Thinking…"}
                    </span>
                  </div>
                ) : (
                  <span>{msg.content}</span>
                )}
              </div>
            </div>
          ))}

          {/* Tool status indicator (while assistant has partial content) */}
          {isStreaming && toolStatus && messages[messages.length - 1]?.content && (
            <div className="flex items-center gap-2 text-xs text-text-muted pl-1">
              <Loader2 size={12} className="animate-spin" />
              {toolStatus}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ── Input bar ── */}
<div className="border-t border-border-light px-4 py-3">
  <div
    className={`mx-auto w-full ${
      isExpanded ? "max-w-4xl" : ""
    }`}
  >
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
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask your study question here"
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

    <p className="mt-2 text-center text-[10px] text-text-muted opacity-60">
      Enhanced by AI
    </p>
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
