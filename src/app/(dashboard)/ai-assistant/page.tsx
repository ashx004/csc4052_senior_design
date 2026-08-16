"use client";

import { FormEvent, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { FileDown, History, Loader2, Mic, Paperclip, BookOpen, ListChecks, Wrench } from "lucide-react";
import ToolboxPanel from "@/src/components/aiAssistant/ToolboxPanel";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { useAuth } from "@/src/context/AuthContext";
import { buildChatContext, ChatContext } from "@/src/library/chatContext";
import {
  addLocalMessage,
  getChatSession,
  subscribeToChatSession,
  StoredChatMessage,
} from "@/src/library/chatMemory";
import { deriveChatTitle } from "@/src/library/chatTitle";
import ChatUploadModal from "@/src/components/aiAssistant/ChatUploadModal";
import ChatHistoryPanel from "@/src/components/aiAssistant/ChatHistoryPanel";
import { readChatStream, TOOL_STATUS_LABELS } from "@/src/library/chatStream";
import { useChatStatus } from "@/src/library/useChatStatus";
import { getEffectiveModelKey } from "@/src/library/chatMode";

type ChatMessage = StoredChatMessage;

type StarterPrompt = { title: string; subtitle: string; prompt: string };

// Memoized so typing in the input (which lives in the same parent component)
// doesn't re-render every existing message's ReactMarkdown parse on each
// keystroke — confirmed live 2026-07-21 as the cause of visible input lag
// that got worse the longer a conversation ran.
const ChatMessageBubble = memo(function ChatMessageBubble({
  message,
  isPending,
  toolStatus,
  onCopy,
}: {
  message: ChatMessage;
  isPending: boolean;
  toolStatus: string | null;
  onCopy: (text: string) => void;
}) {
  const isUser = message.role === "user";

  return (
    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
      {isUser ? (
        <div className="max-w-xl rounded-2xl rounded-tr-md bg-primary px-5 py-3 text-sm leading-relaxed text-text-inverse shadow-sm">
          {message.text}
        </div>
      ) : isPending ? (
        <div className="flex items-center gap-2 rounded-2xl bg-bg-container px-5 py-4 shadow-sm ring-1 ring-border-light">
          {toolStatus ? (
            <>
              <Loader2 size={14} className="shrink-0 animate-spin text-text-muted" />
              <span className="text-sm text-text-muted">{toolStatus}</span>
            </>
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
            <div className="prose prose-sm max-w-none rounded-2xl bg-bg-container px-5 py-4 leading-relaxed shadow-sm ring-1 ring-border-light prose-headings:mb-2 prose-headings:mt-3 prose-headings:text-text-main prose-p:my-1.5 prose-p:text-text-main prose-strong:text-text-main prose-a:text-primary prose-blockquote:border-primary prose-blockquote:text-text-muted prose-code:rounded prose-code:bg-bg-warm prose-code:px-1 prose-code:py-0.5 prose-code:text-text-main prose-code:before:content-none prose-code:after:content-none prose-pre:bg-bg-warm prose-pre:text-text-main prose-ol:text-text-main prose-ul:text-text-main prose-li:my-0.5 prose-table:text-text-main prose-th:text-text-main">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                {message.text}
              </ReactMarkdown>
            </div>

            <button
              type="button"
              onClick={() => onCopy(message.text)}
              className="mt-2 rounded-md border border-border-light bg-bg-container px-2 py-1 text-xs text-text-muted opacity-80 transition hover:bg-bg-warm group-hover:opacity-100"
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
                  className="flex items-center gap-1.5 rounded-md border border-border-light bg-bg-container px-3 py-1.5 text-xs font-medium text-primary shadow-sm transition hover:bg-bg-warm"
                >
                  <FileDown size={14} />
                  {file.name}
                </a>
              ))}
            </div>
          )}

          {message.generatedStudySets && (
            <div className="flex flex-wrap gap-2 px-1">
              {message.generatedStudySets.map((set) => (
                <Link
                  key={`${set.kind}-${set.id}`}
                  href={
                    set.kind === "flashcard"
                      ? `/courses/${set.courseId}/flashcards?setId=${set.id}`
                      : `/courses/${set.courseId}/quizzes/${set.id}?mode=take`
                  }
                  className="flex items-center gap-1.5 rounded-md border border-border-light bg-bg-container px-3 py-1.5 text-xs font-medium text-primary shadow-sm transition hover:bg-bg-warm"
                >
                  {set.kind === "flashcard" ? <BookOpen size={14} /> : <ListChecks size={14} />}
                  {set.kind === "flashcard" ? "Study" : "Take quiz"}: {set.name}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

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

const MAX_CHAT_INPUT_CHARS = 4000;

// Resuming a long-running session renders only the most recent messages up
// front — roughly the last 20 exchanges, generous enough to keep real
// context on screen without dumping months of history into the DOM at
// once. The full transcript is already in memory either way (the session
// doc is fetched whole), so this is purely a render cap with a "show
// earlier messages" escape hatch, not a data-fetching limit.
const INITIAL_VISIBLE_MESSAGES = 40;

// sessionStorage (not cookies/localStorage) so this only survives in-tab
// navigation — closing the tab or opening the site fresh elsewhere starts a
// new session with a clean slate, but swapping to Settings and back within
// the same tab keeps the active conversation instead of losing it.
const ACTIVE_CHAT_SESSION_KEY = "catalyst:activeChatSessionId";

// useSearchParams (used below to resume a session from the URL on refresh)
// requires a Suspense boundary around anything that calls it, or Next.js
// bails out of static generation for the whole page at build time — see
// https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout.
export default function AIAssistantPage() {
  return (
    <Suspense fallback={null}>
      <AIAssistantPageContent />
    </Suspense>
  );
}

function AIAssistantPageContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [input, setInput] = useState("");
  const [toolboxOpen, setToolboxOpen] = useState(false);
  const toolboxBtnRef = useRef<HTMLButtonElement | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Non-null right after resuming a session long enough to cap (see
  // INITIAL_VISIBLE_MESSAGES) — null means "show everything," which is also
  // the state for a brand-new/short chat and for a resumed one once the
  // student reveals the rest or sends a new message (see handleSubmit).
  const [visibleMessageCount, setVisibleMessageCount] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [isSending, setIsSending] = useState(false);
  const chatStatus = useChatStatus();
  const [errorText, setErrorText] = useState<string | null>(null);
  const [chatContext, setChatContext] = useState<ChatContext | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [micSupported, setMicSupported] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  // Only set for a session resumed mid-generation via loadSession (see
  // generatingWatchRef below) — isSending/chatStatus alone can't tell the
  // pending bubble to render, since those only ever get set by THIS
  // component instance's own handleSubmit call, not by a generation that
  // was already running server-side before this instance mounted.
  const [isResuming, setIsResuming] = useState(false);
  const sessionId = useRef<string | null>(null);
  // Tracks the in-flight buildChatContext call so handleSubmit can wait for
  // it even if the student sends a message before the state update lands —
  // without this, a message sent in that window goes out with context:null,
  // and the assistant answers as if it has no idea what classes exist.
  const chatContextPromiseRef = useRef<Promise<ChatContext | null> | null>(null);
  const nextId = useRef(1);
  const recognitionRef = useRef<any>(null);
  const summaryRef = useRef("");
  const summarizedCountRef = useRef(0);
  const titleRef = useRef("");
  // Watches a still-generating session live after loadSession resumes it —
  // see the generating-flag handling there. Only ever one at a time.
  const generatingWatchRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => generatingWatchRef.current?.();
  }, []);

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
      setInput((prev) =>
        (prev.trim() ? `${prev.trim()} ${transcript}` : transcript).slice(0, MAX_CHAT_INPUT_CHARS)
      );
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

  // Distinct from chatContext itself (which is legitimately null both
  // before loading AND after a failed load) — gates whether to show a
  // skeleton or the real starter prompts. Without this, the page briefly
  // showed generic starter prompts (context null) that then got visibly
  // swapped for personalized ones a second or two later once
  // buildChatContext resolved — confirmed distracting in practice, and this
  // avoids ever rendering text that's about to be replaced.
  const [contextLoaded, setContextLoaded] = useState(false);

  useEffect(() => {
    if (authLoading || !user?.email) return;

    chatContextPromiseRef.current = buildChatContext(user.uid, user.email)
      .then((ctx) => {
        setChatContext(ctx);
        return ctx;
      })
      .catch((error) => {
        console.error("Error building chat context:", error);
        setChatContext(null);
        return null;
      })
      .finally(() => setContextLoaded(true));
  }, [user, authLoading]);

  // Keeps the URL in sync with whichever session is active (so a page
  // refresh has something to resume from — not real navigation, so no
  // history entry and no scroll reset) and mirrors it into sessionStorage,
  // which is what makes resuming survive actual in-app navigation (e.g. to
  // Settings and back) without also surviving leaving the site entirely —
  // sessionStorage clears when the tab/site session ends, unlike cookies or
  // localStorage.
  function updateSessionUrl(id: string | null) {
    router.replace(id ? `${pathname}?session=${id}` : pathname, { scroll: false });
    if (id) {
      sessionStorage.setItem(ACTIVE_CHAT_SESSION_KEY, id);
    } else {
      sessionStorage.removeItem(ACTIVE_CHAT_SESSION_KEY);
    }
  }

  // Runs once auth settles: resumes whichever session was last active in
  // this tab, checking the URL first (a refresh of a URL updateSessionUrl
  // previously wrote) and falling back to sessionStorage (a plain in-app
  // nav-link visit, e.g. returning from Settings, which carries no
  // ?session= param but should still land back on the same conversation).
  // sessionStorage is per-tab/session-scoped, not a cookie — leaving the
  // site entirely (closing the tab, or opening it fresh elsewhere) starts a
  // new session with nothing to resume, by design.
  useEffect(() => {
    if (authLoading || !user) return;
    const urlSessionId = searchParams.get("session") || sessionStorage.getItem(ACTIVE_CHAT_SESSION_KEY);
    if (urlSessionId && urlSessionId !== sessionId.current) {
      loadSession(urlSessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  const starterPrompts = useMemo(() => getStarterPrompts(chatContext), [chatContext]);

  const displayedMessages = useMemo(
    () => (visibleMessageCount != null ? messages.slice(-visibleMessageCount) : messages),
    [messages, visibleMessageCount]
  );
  const hiddenMessageCount =
    visibleMessageCount != null ? Math.max(0, messages.length - visibleMessageCount) : 0;

  // Jumps to the newest message whenever the visible set actually changes
  // content — a session resuming (messages replaced wholesale), a new
  // token streaming in, or a live-watched reply updating. Deliberately NOT
  // keyed on visibleMessageCount alone: revealing older messages via the
  // "show earlier" button below must not yank the student back down away
  // from the history they just asked to see.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages]);

  async function loadSession(id: string) {
    if (!user || id === sessionId.current) {
      setShowHistoryPanel(false);
      return;
    }
    generatingWatchRef.current?.();
    generatingWatchRef.current = null;
    setIsResuming(false);
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
      setVisibleMessageCount(
        session.messages.length > INITIAL_VISIBLE_MESSAGES ? INITIAL_VISIBLE_MESSAGES : null
      );
      setHasStarted(session.messages.length > 0);
      nextId.current = session.messages.length ? Math.max(...session.messages.map((m) => m.id)) + 1 : 1;
      setInput("");
      setErrorText(null);
      updateSessionUrl(session.id);

      // Reopened a session while the server was still generating its
      // latest reply in the background (e.g. the user left mid-answer) —
      // watch it live instead of leaving a stale empty bubble until a
      // manual refresh. isResuming stands in for isSending (which only
      // this instance's own handleSubmit ever sets) so the placeholder
      // renders as pending instead of a blank finished bubble.
      if (session.generating) {
        setIsResuming(true);
        chatStatus.progress("Catching up on this reply...");
        generatingWatchRef.current = subscribeToChatSession(user.uid, session.id, (updated) => {
          setMessages(updated.messages);
          // The server now writes the reply's text periodically while it's
          // still generating (see persistPartialReply in api/chat/route.ts),
          // not just once at the end — as soon as the placeholder has real
          // text, the bubble itself switches from pending to rendering that
          // text (see isPending below), so the status label is redundant.
          const last = updated.messages[updated.messages.length - 1];
          if (!updated.generating || last?.text) {
            setIsResuming(false);
            chatStatus.clear();
          }
          if (!updated.generating) {
            generatingWatchRef.current?.();
            generatingWatchRef.current = null;
          }
        });
      }
    } catch (error) {
      console.error("Error loading chat session:", error);
    } finally {
      setShowHistoryPanel(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = input.trim();
    if (!trimmed || isSending) {
      return;
    }

    // Sending a new message makes the just-submitted stream authoritative
    // for this session's state — stop watching a previous resumed-live
    // generation so it can't race the local updates below.
    generatingWatchRef.current?.();
    generatingWatchRef.current = null;
    setIsResuming(false);
    // Actively chatting again — show the full transcript rather than
    // keeping an old resume-time cap that would otherwise start hiding the
    // student's own new messages once enough of them push the window past
    // INITIAL_VISIBLE_MESSAGES.
    setVisibleMessageCount(null);

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
    chatStatus.connecting();

    function updateAssistant(patch: Partial<ChatMessage>) {
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, ...patch } : m)));
    }

    // chatContext may still be null if this message is sent right after the
    // page loads, before buildChatContext's state update has landed — wait
    // on the actual in-flight promise rather than sending stale/empty
    // context (see chatContextPromiseRef above).
    const effectiveContext = chatContext ?? (await chatContextPromiseRef.current);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.text,
          })),
          context: effectiveContext,
          summary: summaryRef.current,
          summarizedCount: summarizedCountRef.current,
          currentSessionId: sessionId.current,
          modelKey: getEffectiveModelKey("chat"),
        }),
      });

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Something went wrong.");
      }

      chatStatus.streaming();
      let text = "";
      let streamError: string | null = null;
      let documentsRead: string[] | undefined;
      let generatedFiles: { name: string; url: string }[] | undefined;
      let generatedStudySets: { kind: "flashcard" | "quiz"; id: string; courseId: string; name: string }[] | undefined;

      for await (const event of readChatStream(response)) {
        if (event.type === "delta") {
          text += event.text;
          chatStatus.clear();
          updateAssistant({ text });
        } else if (event.type === "tool") {
          chatStatus.tool(TOOL_STATUS_LABELS[event.name] || "Working on it...");
        } else if (event.type === "status") {
          chatStatus.progress(event.label);
        } else if (event.type === "session") {
          // Brand-new session — the server already created its Firestore
          // doc (see startChatPersistence in api/chat/route.ts), so just
          // adopt the ID rather than creating one ourselves.
          sessionId.current = event.id;
          setActiveSessionId(event.id);
          updateSessionUrl(event.id);
        } else if (event.type === "done") {
          if (event.documentsRead?.length) documentsRead = event.documentsRead;
          if (event.generatedFiles?.length) generatedFiles = event.generatedFiles;
          if (event.generatedStudySets?.length) generatedStudySets = event.generatedStudySets;
          if (typeof event.summary === "string") summaryRef.current = event.summary;
          if (typeof event.summarizedCount === "number") summarizedCountRef.current = event.summarizedCount;
        } else if (event.type === "error") {
          streamError = event.error;
        }
      }

      if (!text) {
        // No content ever arrived — whether from an explicit error event or
        // a stream that ended early (e.g. a dropped connection) without one.
        // Never silently show/persist an empty bubble.
        throw new Error(streamError || "The assistant didn't generate a response. Please try again.");
      }

      // The server already persisted the finished reply (see the route's
      // finally block) — this just reflects it locally for whoever's still
      // watching this tab.
      const finalMessage: ChatMessage = { id: assistantId, role: "assistant", text };
      if (documentsRead) finalMessage.documentsRead = documentsRead;
      if (generatedFiles) finalMessage.generatedFiles = generatedFiles;
      if (generatedStudySets) finalMessage.generatedStudySets = generatedStudySets;
      setMessages([...nextMessages, finalMessage]);

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
      chatStatus.clear();
    }
  }

  function handleNewChat() {
    generatingWatchRef.current?.();
    generatingWatchRef.current = null;
    setIsResuming(false);
    setHasStarted(false);
    setInput("");
    setMessages([]);
    setVisibleMessageCount(null);
    setErrorText(null);
    sessionId.current = null;
    setActiveSessionId(null);
    summaryRef.current = "";
    summarizedCountRef.current = 0;
    titleRef.current = "";
    document.title = "Catalyst";
    updateSessionUrl(null);
  }

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      console.log("Copy failed");
    }
  }, []);

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

    if (user) {
      addLocalMessage(user.uid, sessionId.current, nextMessages, {
        summary: summaryRef.current,
        summarizedCount: summarizedCountRef.current,
        title: titleRef.current,
      })
        .then((id) => {
          if (!sessionId.current) {
            sessionId.current = id;
            setActiveSessionId(id);
            updateSessionUrl(id);
          }
        })
        .catch((error) => console.error("Error saving upload notice:", error));
    }

    if (user?.email) {
      chatContextPromiseRef.current = buildChatContext(user.uid, user.email)
        .then((ctx) => {
          setChatContext(ctx);
          return ctx;
        })
        .catch(() => null);
    }
  }

  return (
    <section className="flex h-screen flex-col bg-bg-main text-text-main">
      <header className="relative flex h-[60px] shrink-0 items-center justify-between border-b border-border-light px-6">
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
              <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-3xl border border-border-light bg-bg-container shadow-sm">
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
                {!contextLoaded
                  ? [0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-[74px] animate-pulse rounded-2xl border border-border-light bg-bg-warm"
                      />
                    ))
                  : starterPrompts.map((starter) => (
                  <button
                    key={starter.title}
                    type="button"
                    onClick={() => setInput(starter.prompt)}
                    className="rounded-2xl border border-border-light bg-bg-container p-4 text-left text-sm shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
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
              {hiddenMessageCount > 0 && (
                <button
                  type="button"
                  onClick={() => setVisibleMessageCount(null)}
                  className="mx-auto rounded-full border border-border-light bg-bg-container px-4 py-1.5 text-xs text-text-muted shadow-sm transition hover:bg-bg-warm"
                >
                  Show {hiddenMessageCount} earlier {hiddenMessageCount === 1 ? "message" : "messages"}
                </button>
              )}

              {displayedMessages.map((message) => (
                <ChatMessageBubble
                  key={message.id}
                  message={message}
                  isPending={message.text === "" && (isSending || isResuming)}
                  toolStatus={chatStatus.status}
                  onCopy={handleCopy}
                />
              ))}

              <div ref={messagesEndRef} />
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
            className="relative mx-auto flex max-w-4xl items-center gap-3 rounded-2xl border border-border-light bg-bg-container px-4 py-2 shadow-lg shadow-stone-200/70"
          >
            <button
              type="button"
              ref={toolboxBtnRef}
              onClick={() => setToolboxOpen((open) => !open)}
              title="See what the assistant can do"
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${
                toolboxOpen ? "bg-primary text-text-inverse" : "text-primary hover:bg-bg-warm"
              }`}
              aria-label="Show available AI tools"
              aria-pressed={toolboxOpen}
            >
              <Wrench size={18} strokeWidth={2} />
            </button>

            <ToolboxPanel
              open={toolboxOpen}
              onClose={() => setToolboxOpen(false)}
              anchorRef={toolboxBtnRef}
            />

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
              onChange={(event) => setInput(event.target.value.slice(0, MAX_CHAT_INPUT_CHARS))}
              placeholder="Ask Catalyst anything..."
              disabled={isSending}
              maxLength={MAX_CHAT_INPUT_CHARS}
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
                  ? "animate-pulse bg-alert-error text-text-inverse"
                  : "text-primary hover:bg-bg-warm"
              }`}
              aria-label={isListening ? "Stop voice input" : "Start voice input"}
            >
              <Mic size={18} strokeWidth={2} />
            </button>

            <button
              type="submit"
              disabled={isSending || !input.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xl text-text-inverse shadow-sm transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
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
