"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, FileText, Loader2, Maximize2, Minimize2, NotebookText, PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import type { ClassOption, Note } from "@/src/library/notes/types";

const RECENT_COUNT = 20;

function relative(date: Date): string {
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 7 ? `${days}d ago` : date.toLocaleDateString();
}

/** Page frame for an open note: top bar, recent-notes rail, content. */
export default function NoteWorkspace({
  note,
  notes,
  classes,
  title,
  onTitleChange,
  saveState,
  allNotesHref,
  onNewNote,
  children,
}: {
  note: Note;
  notes: Note[];
  classes: ClassOption[];
  title: string;
  onTitleChange: (title: string) => void;
  saveState: "saved" | "saving" | "error";
  allNotesHref: string;
  onNewNote: () => void;
  children: ReactNode;
}) {
  const router = useRouter();
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const course = classes.find((c) => c.id === note.courseId);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await frameRef.current?.requestFullscreen();
    } catch {
      // Not allowed here (some embedded views) - the page is still usable.
    }
  }

  const recent = notes.slice(0, RECENT_COUNT);

  return (
    <div ref={frameRef} className="flex h-full min-h-screen flex-col bg-bg-main">
      {/* md:pl-20 clears the site's fixed menu button (Sidebar.tsx), which sits
          over this corner whenever the sidebar is collapsed on desktop. */}
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border-light bg-bg-main/95 px-3 py-2 backdrop-blur sm:px-5 md:pl-20">
        <button
          type="button"
          onClick={() => setRailOpen((o) => !o)}
          aria-label={railOpen ? "Hide your notes" : "Show your notes"}
          title={railOpen ? "Hide your notes" : "Your notes"}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-text-main hover:bg-bg-warm"
          data-tutorial="note-rail-toggle"
        >
          {railOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          <span className="hidden sm:inline">Notes</span>
        </button>
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          aria-label="Note title"
          maxLength={120}
          className="min-w-0 flex-1 truncate rounded-lg bg-transparent px-2 py-1 text-base font-semibold text-text-main outline-none hover:bg-bg-warm focus:bg-bg-warm sm:text-lg"
        />
        {course && (
          <span className="hidden shrink-0 rounded-full bg-bg-warm px-2.5 py-1 text-xs font-medium text-text-muted md:inline">
            {course.classCode || course.className}
          </span>
        )}
        <span className="flex shrink-0 items-center gap-1 text-xs text-text-muted" role="status" aria-live="polite">
          {saveState === "saving" ? (
            <>
              <Loader2 size={13} className="animate-spin" /> <span className="hidden sm:inline">Saving</span>
            </>
          ) : saveState === "error" ? (
            <span className="text-alert-error">Not saved - check your connection</span>
          ) : (
            <>
              <Check size={13} /> <span className="hidden sm:inline">Saved</span>
            </>
          )}
        </span>
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={fullscreen ? "Exit full screen" : "Full screen"}
          title={fullscreen ? "Exit full screen" : "Full screen"}
          className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-main hover:bg-bg-warm sm:flex"
        >
          {fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {railOpen && (
          <aside
            className="absolute inset-y-0 left-0 z-20 flex w-72 max-w-[85vw] flex-col border-r border-border-light bg-bg-container shadow-lg md:static md:shadow-none"
            aria-label="Recent notes"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border-light p-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Recent notes</span>
              <button
                type="button"
                onClick={onNewNote}
                className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-text-inverse hover:bg-primary-hover"
              >
                <Plus size={14} /> New
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-2">
              {recent.map((n) => {
                const c = classes.find((x) => x.id === n.courseId);
                const active = n.id === note.id;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => router.push(`/notes/${n.id}`)}
                    className={`mb-0.5 flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                      active ? "bg-bg-warm" : "hover:bg-bg-main"
                    }`}
                    aria-current={active ? "page" : undefined}
                  >
                    {n.kind === "typed" ? (
                      <NotebookText size={15} className="mt-0.5 shrink-0 text-primary" />
                    ) : (
                      <FileText size={15} className="mt-0.5 shrink-0 text-text-muted" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-text-main">{n.title}</span>
                      <span className="block truncate text-xs text-text-muted">
                        {c ? `${c.classCode || c.className} · ` : ""}
                        {relative(n.updatedAt)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </nav>
            <Link
              href={allNotesHref}
              className="m-3 rounded-lg border border-border-light py-2 text-center text-sm font-medium text-text-main hover:bg-bg-warm"
            >
              All notes
            </Link>
          </aside>
        )}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
