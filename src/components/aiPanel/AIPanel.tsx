"use client";

import { FormEvent, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquare, X, Send } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { useAuth } from "@/src/context/AuthContext";
import { useAIPageContext } from "@/src/context/AIPageContext";
import { useAIPanelChat } from "./useAIPanelChat";

const STORAGE_KEY = "catalyst:aiPanelOpen";

// Deliberately generic regardless of pageContext — the panel shouldn't
// volunteer what's on screen unprompted (confirmed 2026-07 as unwanted:
// dumping the page summary into the very first message was both noisy and
// the main source of unnecessary token/context bloat). The real page data
// still reaches the model via buildPageContextLayer in api/chat/route.ts,
// so it's available and accurate the moment the student actually asks.
function buildGreeting(): string {
  return "Hi! I'm Catalyst — ask me anything about your classes, studies, or what's on this page.";
}

export default function AIPanel() {
  const pathname = usePathname();
  const { user } = useAuth();
  const pageContext = useAIPageContext();
  const { messages, isSending, toolStatus, errorText, sendMessage } = useAIPanelChat(user?.uid, user?.email ?? undefined);
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");

  useEffect(() => {
    setIsOpen(typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY) === "true");
  }, []);

  function toggleOpen(next: boolean) {
    setIsOpen(next);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, String(next));
  }

  // The full dedicated chat experience already lives at /ai-assistant —
  // showing the floating panel there too would stack two chat UIs on the
  // same page for no benefit.
  if (pathname === "/ai-assistant") return null;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input;
    setInput("");
    sendMessage(text, pageContext);
  }

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => toggleOpen(true)}
          className="fixed bottom-6 right-6 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-lg transition hover:bg-primary-hover"
          aria-label="Open AI assistant panel"
        >
          <MessageSquare className="h-5 w-5" />
        </button>
      )}

      <aside
        className={`h-screen shrink-0 overflow-hidden border-l border-border-light bg-bg-container transition-[width] duration-300 ease-in-out ${
          isOpen ? "w-96" : "w-0"
        }`}
      >
        <div className="flex h-full min-w-[24rem] flex-col">
          <div className="flex items-center justify-between border-b border-border-light px-4 py-4">
            <h2 className="text-sm font-semibold tracking-[0.2em] text-text-main">CATALYST</h2>
            <button
              onClick={() => toggleOpen(false)}
              className="rounded-full p-1.5 text-text-muted transition-colors hover:text-text-main"
              aria-label="Close AI assistant panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            <div className="rounded-2xl bg-bg-container px-4 py-3 text-sm leading-relaxed text-text-main shadow-sm ring-1 ring-border-light">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                {buildGreeting()}
              </ReactMarkdown>
            </div>

            {messages.map((message) => (
              <div key={message.id} className={`flex w-full ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                {message.role === "user" ? (
                  <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-primary px-4 py-2.5 text-sm leading-relaxed text-white shadow-sm">
                    {message.text}
                  </div>
                ) : message.text ? (
                  <div className="prose prose-sm max-w-[85%] rounded-2xl bg-bg-container px-4 py-3 leading-relaxed shadow-sm ring-1 ring-border-light prose-headings:text-text-main prose-p:my-1 prose-p:text-text-main prose-strong:text-text-main prose-a:text-primary prose-code:text-text-main">
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                      {message.text}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-2xl bg-bg-container px-4 py-3 shadow-sm ring-1 ring-border-light">
                    {toolStatus ? (
                      <span className="text-xs text-text-muted">{toolStatus}</span>
                    ) : (
                      <>
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:-0.3s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:-0.15s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted" />
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}

            {errorText && (
              <div className="rounded-2xl bg-alert-error-bg px-4 py-2.5 text-sm text-alert-error shadow-sm">
                {errorText}
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-border-light p-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Catalyst..."
              maxLength={4000}
              disabled={isSending}
              className="flex-1 rounded-full border border-border-light bg-bg-container px-4 py-2 text-sm focus:border-primary focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={isSending || !input.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white transition hover:bg-primary-hover disabled:opacity-50"
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
