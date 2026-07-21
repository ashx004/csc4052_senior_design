"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { FileDown, History, Mic, Paperclip } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuth } from "@/src/context/AuthContext";
import { buildChatContext, ChatContext } from "@/src/library/chatContext";
import {
  createChatSession,
  deriveChatTitle,
  getChatSession,
  getLatestChatSession,
  saveChatState,
  StoredChatMessage,
} from "@/src/library/chatMemory";
import ChatUploadModal from "@/src/components/aiAssistant/ChatUploadModal";
import ChatHistoryPanel from "@/src/components/aiAssistant/ChatHistoryPanel";

type ChatMessage = StoredChatMessage;

type StarterPrompt = { title: string; subtitle: string; prompt: string };

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Grounded, class-specific starters instead of generic placeholders — one of
// the old ones ("Check my grade") referenced a feature that doesn't exist.
// Randomized (class order, which document gets picked) so a fresh page load
// doesn't always show the exact same three suggestions.
function getStarterPrompts(context: ChatContext | null): StarterPrompt[] {
  // context is null on both the server-rendered pass and the first client
  // render (it only ever populates client-side, after hydration, via an
  // async effect) — this branch must stay deterministic. Randomizing it
  // caused a hydration mismatch: SSR and the client's first render each
  // called Math.random() independently and got different orders.
  if (!context || context.classes.length === 0) {
    return [
      {
        title: "See what I can do",
        subtitle: "Ask what Catalyst can help with.",
        prompt: "What can you help me with?",
      },
      {
        title: "Add a class first",
        subtitle: "I'll be a lot more useful once you're enrolled in something.",
        prompt: "How do I add a class?",
      },
      {
        title: "General study help",
        subtitle: "Ask a study or learning question.",
        prompt: "What's a good way to study for an exam?",
      },
    ];
  }

  // Safe to randomize from here on — this only ever runs once real context
  // has loaded, which never happens during SSR or the initial hydration pass.
  const classes = shuffle(context.classes);

  const suggestions: StarterPrompt[] = [];
  const [firstClass, secondClass] = classes;
  const classesWithDocs = classes.filter((c) => c.documents.length > 0);
  const withDocs = classesWithDocs[Math.floor(Math.random() * classesWithDocs.length)];

  suggestions.push({
    title: `${firstClass.classCode} materials`,
    subtitle: `See what's uploaded for ${firstClass.classCode}.`,
    prompt: `What materials do I have for ${firstClass.classCode}?`,
  });

  if (withDocs) {
    const doc = withDocs.documents[Math.floor(Math.random() * withDocs.documents.length)];
    suggestions.push({
      title: `Summarize a document`,
      subtitle: `"${doc.name}" from ${withDocs.classCode}.`,
      prompt: `Can you summarize "${doc.name}" from ${withDocs.classCode}?`,
    });
  } else if (secondClass) {
    suggestions.push({
      title: `${secondClass.classCode} materials`,
      subtitle: `See what's uploaded for ${secondClass.classCode}.`,
      prompt: `What materials do I have for ${secondClass.classCode}?`,
    });
  } else {
    suggestions.push({
      title: "Upload something",
      subtitle: `Add a document to ${firstClass.classCode} to get started.`,
      prompt: `What kinds of documents can I upload for ${firstClass.classCode}?`,
    });
  }

  const studyClass = classes[Math.floor(Math.random() * classes.length)];
  suggestions.push({
    title: "Study plan",
    subtitle: `Ask what to focus on in ${studyClass.classCode}.`,
    prompt: `What should I study first in ${studyClass.classCode}?`,
  });

  return suggestions.slice(0, 3);
}

const TOOL_STATUS_LABELS: Record<string, string> = {
  search_documents: "Searching your documents...",
  read_document: "Reading a document...",
  web_search: "Searching the web...",
  search_youtube: "Looking for videos...",
  create_pdf: "Creating a PDF...",
  recall_past_chat: "Checking past conversations...",
  self_check: "Double-checking that answer...",
};

export default function AIAssistantPage() {
  const { user, loading: authLoading } = useAuth();
  const [input, setInput] = useState("");
  const [hasStarted, setHasStarted] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [chatContext, setChatContext] = useState<ChatContext | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [micSupported, setMicSupported] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const sessionId = useRef<string | null>(null);
  const nextId = useRef(1);
  const recognitionRef = useRef<any>(null);
  const summaryRef = useRef("");
  const summarizedCountRef = useRef(0);
  const titleRef = useRef("");

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setMicSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript as string;
      setInput((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
    };

    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;

    return () => {
      try {
        recognition.stop();
      } catch {
        // already stopped — fine
      }
    };
  }, []);

  function handleMicClick() {
    if (!micSupported || !recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch (error) {
      console.error("Couldn't start speech recognition:", error);
    }
  }

  useEffect(() => {
    if (authLoading || !user?.email) return;

    buildChatContext(user.uid, user.email)
      .then(setChatContext)
      .catch((error) => {
        console.error("Error building chat context:", error);
        setChatContext(null);
      });

    getLatestChatSession(user.uid)
      .then((session) => {
        if (session && session.messages.length > 0) {
          sessionId.current = session.id;
          setActiveSessionId(session.id);
          summaryRef.current = session.summary;
          summarizedCountRef.current = session.summarizedCount;
          titleRef.current = session.title;
          if (session.title) document.title = `Catalyst — ${session.title}`;
          setMessages(session.messages);
          setHasStarted(true);
          nextId.current = Math.max(...session.messages.map((m) => m.id)) + 1;
        }
      })
      .catch((error) => console.error("Error loading chat session:", error));
  }, [user, authLoading]);

  const starterPrompts = useMemo(() => getStarterPrompts(chatContext), [chatContext]);

  async function loadSession(id: string) {
    if (!user || id === sessionId.current) {
      setShowHistoryPanel(false);
      return;
    }
    try {
      const session = await getChatSession(user.uid, id);
      if (!session) return;

      sessionId.current = session.id;
      setActiveSessionId(session.id);
      summaryRef.current = session.summary;
      summarizedCountRef.current = session.summarizedCount;
      titleRef.current = session.title;
      document.title = session.title ? `Catalyst — ${session.title}` : "Catalyst";
      setMessages(session.messages);
      setHasStarted(session.messages.length > 0);
      nextId.current = session.messages.length ? Math.max(...session.messages.map((m) => m.id)) + 1 : 1;
      setInput("");
      setErrorText(null);
    } catch (error) {
      console.error("Error loading chat session:", error);
    } finally {
      setShowHistoryPanel(false);
    }
  }

  async function persist(nextMessages: ChatMessage[]) {
    if (!user) return;
    try {
      if (!sessionId.current) {
        sessionId.current = await createChatSession(user.uid);
        setActiveSessionId(sessionId.current);
      }
      await saveChatState(user.uid, sessionId.current, {
        messages: nextMessages,
        summary: summaryRef.current,
        summarizedCount: summarizedCountRef.current,
        title: titleRef.current,
      });
    } catch (error) {
      console.error("Error saving chat session:", error);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = input.trim();
    if (!trimmed || isSending) {
      return;
    }

    const userMessage: ChatMessage = {
      id: nextId.current++,
      role: "user",
      text: trimmed,
    };
    const nextMessages = [...messages, userMessage];

    if (!titleRef.current && messages.length === 0) {
      titleRef.current = deriveChatTitle(trimmed);
      document.title = `Catalyst — ${titleRef.current}`;
    }

    const assistantId = nextId.current++;
    const assistantMessage: ChatMessage = { id: assistantId, role: "assistant", text: "" };

    setMessages([...nextMessages, assistantMessage]);
    setHasStarted(true);
    setInput("");
    setErrorText(null);
    setIsSending(true);
    setToolStatus(null);

    function updateAssistant(patch: Partial<ChatMessage>) {
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, ...patch } : m)));
    }

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.text,
          })),
          context: chatContext,
          summary: summaryRef.current,
          summarizedCount: summarizedCountRef.current,
          currentSessionId: sessionId.current,
        }),
      });

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Something went wrong.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let text = "";
      let streamError: string | null = null;
      let documentsRead: string[] | undefined;
      let generatedFiles: { name: string; url: string }[] | undefined;

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
            text += event.text;
            setToolStatus(null);
            updateAssistant({ text });
          } else if (event.type === "tool") {
            setToolStatus(TOOL_STATUS_LABELS[event.name] || "Working on it...");
          } else if (event.type === "done") {
            if (event.documentsRead?.length) documentsRead = event.documentsRead;
            if (event.generatedFiles?.length) generatedFiles = event.generatedFiles;
            if (typeof event.summary === "string") summaryRef.current = event.summary;
            if (typeof event.summarizedCount === "number") summarizedCountRef.current = event.summarizedCount;
          } else if (event.type === "error") {
            streamError = event.error;
          }
        }
      }

      if (!text) {
        // No content ever arrived — whether from an explicit error event or
        // a stream that ended early (e.g. a dropped connection) without one.
        // Never silently show/persist an empty bubble.
        throw new Error(streamError || "The assistant didn't generate a response. Please try again.");
      }

      const finalMessage: ChatMessage = { id: assistantId, role: "assistant", text };
      if (documentsRead) finalMessage.documentsRead = documentsRead;
      if (generatedFiles) finalMessage.generatedFiles = generatedFiles;

      const withReply = [...nextMessages, finalMessage];
      setMessages(withReply);
      persist(withReply);

      if (streamError) setErrorText(streamError);
    } catch (error) {
      console.error("Chat request failed:", error);
      // Drop the empty placeholder bubble rather than leaving a blank one.
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      setErrorText(
        error instanceof Error ? error.message : "Couldn't reach the assistant. Please try again."
      );
    } finally {
      setIsSending(false);
      setToolStatus(null);
    }
  }

  function handleNewChat() {
    setHasStarted(false);
    setInput("");
    setMessages([]);
    setErrorText(null);
    sessionId.current = null;
    setActiveSessionId(null);
    summaryRef.current = "";
    summarizedCountRef.current = 0;
    titleRef.current = "";
    document.title = "Catalyst";
  }

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      console.log("Copy failed");
    }
  }

  function handleUploaded(fileNames: string[], classCode: string) {
    setShowUploadModal(false);

    const notice: ChatMessage = {
      id: nextId.current++,
      role: "assistant",
      text: `📄 Uploaded **${fileNames.join(", ")}** to **${classCode}**. I'll be able to search and read ${
        fileNames.length > 1 ? "them" : "it"
      } once indexing finishes in the background.`,
    };
    const nextMessages = [...messages, notice];
    setMessages(nextMessages);
    setHasStarted(true);
    persist(nextMessages);

    if (user?.email) {
      buildChatContext(user.uid, user.email).then(setChatContext).catch(() => {});
    }
  }

  return (
    <section className="flex h-screen flex-col bg-bg-main text-text-main">
      <header className="relative flex h-[73px] shrink-0 items-center justify-between border-b border-border-light bg-bg-container px-6">
        <h1 className="absolute left-1/2 -translate-x-1/2 text-center text-lg font-semibold tracking-[0.45em] text-text-main">
          Catalyst assistant.
        </h1>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowHistoryPanel(true)}
            className="rounded-full p-2 text-text-main transition hover:bg-bg-warm"
            aria-label="Previous chats"
          >
            <History size={20} />
          </button>

          <button
            type="button"
            onClick={handleNewChat}
            className="rounded-full px-3 py-2 text-xl text-text-main transition hover:bg-bg-warm"
            aria-label="New chat"
          >
            +
          </button>
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-6 pb-36 pt-10">
          {!hasStarted ? (
            <div className="mx-auto flex min-h-[55vh] max-w-3xl flex-col items-center justify-center text-center">
              <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-3xl border border-border-light bg-white shadow-sm">
                <span className="text-3xl">✦</span>
              </div>

              <h2 className="mb-4 text-4xl font-semibold tracking-tight text-text-main">
                Welcome to Catalyst.
              </h2>

              <p className="mb-2 text-xl text-text-muted">
                How can we help today?
              </p>

              <p className="text-sm text-text-muted">
                Let&apos;s make the conversation with us.
              </p>

              <div className="mt-10 grid w-full gap-3 md:grid-cols-3">
                {starterPrompts.map((starter) => (
                  <button
                    key={starter.title}
                    type="button"
                    onClick={() => setInput(starter.prompt)}
                    className="rounded-2xl border border-border-light bg-white p-4 text-left text-sm shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <span className="mb-2 block font-medium text-text-main">
                      {starter.title}
                    </span>
                    <span className="text-xs text-text-muted">
                      {starter.subtitle}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
              {messages.map((message) => {
                const isUser = message.role === "user";

                return (
                  <div
                    key={message.id}
                    className={`flex w-full ${
                      isUser ? "justify-end" : "justify-start"
                    }`}
                  >
                    {isUser ? (
                      <div className="max-w-xl rounded-2xl rounded-tr-md bg-primary px-5 py-3 text-sm leading-relaxed text-white shadow-sm">
                        {message.text}
                      </div>
                    ) : message.text === "" && isSending ? (
                      <div className="flex items-center gap-2 rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-border-light">
                        {toolStatus ? (
                          <span className="text-sm text-text-muted">{toolStatus}</span>
                        ) : (
                          <>
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:-0.3s]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:-0.15s]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted" />
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="group flex max-w-2xl flex-col items-start gap-1.5">
                        {message.documentsRead && (
                          <p className="px-1 text-xs text-text-muted">
                            📄 Read: {message.documentsRead.join(", ")}
                          </p>
                        )}

                        <div className="flex items-start gap-3">
                          <div className="prose prose-sm max-w-none rounded-2xl bg-white px-5 py-4 leading-relaxed shadow-sm ring-1 ring-border-light prose-headings:mb-2 prose-headings:mt-3 prose-headings:text-text-main prose-p:my-1.5 prose-p:text-text-main prose-strong:text-text-main prose-a:text-primary prose-blockquote:border-primary prose-blockquote:text-text-muted prose-code:rounded prose-code:bg-bg-warm prose-code:px-1 prose-code:py-0.5 prose-code:text-text-main prose-code:before:content-none prose-code:after:content-none prose-pre:bg-bg-warm prose-pre:text-text-main prose-ol:text-text-main prose-ul:text-text-main prose-li:my-0.5 prose-table:text-text-main prose-th:text-text-main">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleCopy(message.text)}
                            className="mt-2 rounded-md border border-border-light bg-white px-2 py-1 text-xs text-text-muted opacity-80 transition hover:bg-bg-warm group-hover:opacity-100"
                            aria-label="Copy assistant message"
                          >
                            ⧉
                          </button>
                        </div>

                        {message.generatedFiles && (
                          <div className="flex flex-wrap gap-2 px-1">
                            {message.generatedFiles.map((file) => (
                              <a
                                key={file.url}
                                href={file.url}
                                download={file.name}
                                className="flex items-center gap-1.5 rounded-md border border-border-light bg-white px-3 py-1.5 text-xs font-medium text-primary shadow-sm transition hover:bg-bg-warm"
                              >
                                <FileDown size={14} />
                                {file.name}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-bg-main via-bg-main to-transparent pb-4">
          {errorText && (
            <p className="mx-auto mb-2 max-w-4xl text-center text-xs text-alert-error">
              {errorText}
            </p>
          )}

          <form
            onSubmit={handleSubmit}
            className="mx-auto flex max-w-4xl items-center gap-3 rounded-2xl border border-border-light bg-white px-4 py-2 shadow-lg shadow-stone-200/70"
          >
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-primary transition hover:bg-bg-warm"
              aria-label="Upload document"
            >
              <Paperclip size={18} strokeWidth={2} />
            </button>

            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask Catalyst anything..."
              disabled={isSending}
              className="min-w-1 flex-1 bg-transparent text-sm text-text-main outline-none placeholder:text-text-muted disabled:opacity-60"
            />

            <button
              type="button"
              onClick={handleMicClick}
              disabled={!micSupported}
              title={
                micSupported
                  ? isListening
                    ? "Stop listening"
                    : "Voice input"
                  : "Voice input isn't supported in this browser"
              }
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 ${
                isListening
                  ? "animate-pulse bg-alert-error text-white"
                  : "text-primary hover:bg-bg-warm"
              }`}
              aria-label={isListening ? "Stop voice input" : "Start voice input"}
            >
              <Mic size={18} strokeWidth={2} />
            </button>

            <button
              type="submit"
              disabled={isSending || !input.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xl text-white shadow-sm transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Send message"
            >
              ➤
            </button>
          </form>
        </div>
      </main>

      {showUploadModal && user && (
        <ChatUploadModal
          userId={user.uid}
          classes={chatContext?.classes ?? []}
          onClose={() => setShowUploadModal(false)}
          onUploaded={handleUploaded}
        />
      )}

      {showHistoryPanel && user && (
        <ChatHistoryPanel
          userId={user.uid}
          activeSessionId={activeSessionId}
          onClose={() => setShowHistoryPanel(false)}
          onSelect={loadSession}
        />
      )}
    </section>
  );
}
