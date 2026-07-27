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
import { ChevronDown, Send, Sparkles, Loader2 } from "lucide-react";
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

  const handleClose = () => {
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
        className="
          pointer-events-auto absolute top-0 right-0 bottom-0
          w-full sm:w-[420px]
          bg-[var(--background)] border-l border-[var(--border-color)]
          flex flex-col
          shadow-[-4px_0_24px_rgba(0,0,0,0.08)]
          animate-slide-in-right
        "
        style={{
          /* Fallback if CSS vars aren't set */
          backgroundColor: "var(--background, #FAF9F6)",
          borderColor: "var(--border-color, #E5E2DB)",
        }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <Sparkles size={24} className="text-[var(--primary)]" />
            <span className="font-semibold text-xl text-[var(--text-primary)]">
              C  a  t  a  l  y  s  t  A I .
            </span>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--primary)] text-white opacity-80">
              Beta
            </span>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close Catalyst panel"
            className="
              p-1.5 rounded-lg
              hover:bg-[var(--hover-bg)] transition-colors
              text-[var(--text-secondary)]
            "
          >
            <ChevronDown size={20} />
          </button>
        </div>

        {/* ── Context label ── */}
        <div className="px-5 pt-3 pb-1">
          <p className="text-xs text-[var(--text-secondary)] truncate">
            {contextLabel}
          </p>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
          {/* Initial state: heading + suggestions */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center text-center pt-6 pb-2 space-y-5">
              <h3 className="text-2xl font-semibold text-[var(--text-primary)]">
                What would you like explained?
              </h3>
              <p className="text-sm text-[var(--text-secondary)] max-w-[280px]">
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
                      border border-[var(--border-color)]
                      text-sm text-[var(--text-primary)]
                      hover:bg-[var(--hover-bg)] hover:border-[var(--primary)]
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
                className={`
                  max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed
                  ${
                    msg.role === "user"
                      ? "bg-[var(--primary)] text-white rounded-br-md"
                      : "bg-[var(--card-bg)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-bl-md"
                  }
                `}
                style={
                  msg.role === "user"
                    ? { backgroundColor: "var(--primary, #6B705C)" }
                    : {
                        backgroundColor: "var(--card-bg, #FFFFFF)",
                        borderColor: "var(--border-color, #E5E2DB)",
                      }
                }
              >
                {msg.role === "assistant" && msg.content ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : msg.role === "assistant" && !msg.content && isStreaming && i === messages.length - 1 ? (
                  <div className="flex items-center gap-2 text-[var(--text-secondary)]">
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
            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] pl-1">
              <Loader2 size={12} className="animate-spin" />
              {toolStatus}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ── Input bar ── */}
        <div className="border-t border-[var(--border-color)] px-4 py-3">
          <div
            className="
                flex items-end gap-2
                rounded-2xl
                border border-[var(--border-color)]
                bg-[var(--card-bg)]
                px-4 py-3
                shadow-[0_8px_28px_rgba(0,0,0,0.12)]
                transition-shadow duration-200
                focus-within:shadow-[0_12px_36px_rgba(0,0,0,0.18)]
                "
            style={{
              backgroundColor: "var(--card-bg, #FFFFFF)",
              borderColor: "var(--border-color, #E5E2DB)",
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
                flex-1 resize-none bg-transparent outline-none
                text-sm text-[var(--text-primary)]
                placeholder:text-[var(--text-secondary)]
                max-h-[120px] min-h-[24px]
                disabled:opacity-50
              "
              style={{
                height: "auto",
                overflow: "hidden",
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
              }}
            />
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || isStreaming}
              aria-label="Send message"
              className="
                p-2 rounded-full
                bg-[var(--primary)] text-white
                hover:opacity-90 transition-opacity
                disabled:opacity-30 disabled:cursor-not-allowed
                flex-shrink-0
              "
              style={{ backgroundColor: "var(--primary, #6B705C)" }}
            >
              <Send size={16} />
            </button>
          </div>
          <p className="text-[10px] text-[var(--text-secondary)] text-center mt-2 opacity-60">
            Enhanced by AI
          </p>
        </div>
      </div>
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
        bg-[var(--primary)] text-white
        shadow-lg hover:shadow-xl
        hover:scale-[1.03] active:scale-[0.98]
        transition-all duration-200
        text-sm font-medium
      "
      style={{ backgroundColor: "var(--primary, #6B705C)" }}
    >
      <Sparkles size={16} />
      Ask Catalyst
    </button>,
    document.body
  );
}
