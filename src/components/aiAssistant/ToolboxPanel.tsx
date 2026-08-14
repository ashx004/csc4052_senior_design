"use client";

import { useEffect, useRef, type RefObject } from "react";
import { GraduationCap, FileSearch, FileText, BookOpen, ListChecks, CalendarDays, History, Globe } from "lucide-react";

type ToolEntry = {
  icon: typeof GraduationCap;
  label: string;
  description: string;
};

// Mirrors the tool list actually registered in api/chat/route.ts's `tools`
// array (LIST_CLASSES_TOOL, SEARCH_DOCUMENTS_TOOL/READ_DOCUMENT_TOOL,
// CREATE_FLASHCARDS_TOOL, CREATE_QUIZ_TOOL, CREATE_PDF_TOOL, the 4 calendar
// tools, RECALL_PAST_CHAT_TOOL) — every one of these is always sent with
// every request, so there's no per-tool toggle for them; only
// WEB_SEARCH_TOOL/YOUTUBE_SEARCH_TOOL are opt-in (the extraTools flag).
// Update this list if a tool is added/removed there so it doesn't drift.
const ALWAYS_ON_TOOLS: ToolEntry[] = [
  { icon: GraduationCap, label: "Course lookup", description: "Your classes, instructors, and document lists" },
  { icon: FileSearch, label: "Document search", description: "Finds relevant passages across your uploaded documents" },
  { icon: BookOpen, label: "Flashcard creation", description: "Turns a document into a flashcard set you can study" },
  { icon: ListChecks, label: "Quiz creation", description: "Turns a document into a quiz you can take" },
  { icon: FileText, label: "PDF / practice exam creation", description: "Generates a downloadable PDF, saved to your class files" },
  { icon: CalendarDays, label: "Calendar management", description: "Can view, add, reschedule, or remove your calendar events" },
  { icon: History, label: "Recall past chats", description: "Searches your other conversations when you reference something discussed before" },
];

export default function ToolboxPanel({
  open,
  onClose,
  extraTools,
  onToggleExtraTools,
  anchorRef,
}: {
  open: boolean;
  onClose: () => void;
  extraTools: boolean;
  onToggleExtraTools: () => void;
  anchorRef: RefObject<HTMLElement | null>;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Closes on an outside click, same convention as ChatHistoryPanel/
  // ChatUploadModal's dismiss behavior elsewhere on this page.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Available AI tools"
      className="absolute bottom-full left-0 z-20 mb-2 w-80 rounded-xl border border-border-light bg-bg-container p-3 shadow-lg shadow-stone-200/70"
    >
      <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Always available</p>
      <ul className="mb-3 space-y-1">
        {ALWAYS_ON_TOOLS.map((tool) => (
          <li key={tool.label} className="flex items-start gap-2.5 rounded-md px-1.5 py-1.5">
            <tool.icon size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-main">{tool.label}</p>
              <p className="text-xs text-text-muted">{tool.description}</p>
            </div>
          </li>
        ))}
      </ul>

      <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Switchable</p>
      <button
        type="button"
        onClick={onToggleExtraTools}
        className="flex w-full items-start gap-2.5 rounded-md px-1.5 py-1.5 text-left transition hover:bg-bg-warm"
      >
        <Globe size={16} strokeWidth={2} className={`mt-0.5 shrink-0 ${extraTools ? "text-primary" : "text-text-muted"}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-text-main">Web & video search</p>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                extraTools ? "bg-primary text-text-inverse" : "bg-bg-warm text-text-muted"
              }`}
            >
              {extraTools ? "On" : "Off"}
            </span>
          </div>
          <p className="text-xs text-text-muted">Lets the assistant search the live web and YouTube, beyond your course materials</p>
        </div>
      </button>
    </div>
  );
}
