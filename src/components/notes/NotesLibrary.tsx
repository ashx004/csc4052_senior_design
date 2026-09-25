"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  ArrowUpDown,
  BookCopy,
  Check,
  CheckSquare,
  FolderPlus,
  LayoutGrid,
  Layers,
  List,
  Loader2,
  NotebookText,
  Pencil,
  Plus,
  Search,
  Trash2,
  Inbox,
  GraduationCap,
} from "lucide-react";
import { useAuth } from "@/src/context/AuthContext";
import {
  createNotebook,
  deleteNotebook,
  listClasses,
  moveNotesToNotebook,
  NotebookFullError,
  removeNotes,
  renameNotebook,
  subscribeNotebooks,
  subscribeNotes,
  syncClassDocuments,
} from "@/src/library/notes/notesStore";
import { matchesSearch, notebookInCourse, sortNotes, type NoteSort } from "@/src/library/notes/noteText";
import { MAX_NOTES_PER_NOTEBOOK, type ClassOption, type Note, type Notebook } from "@/src/library/notes/types";
import AddNoteChoiceModal from "./AddNoteChoiceModal";
import { classLabel } from "./ClassSelect";
import CreateNoteModal from "./CreateNoteModal";
import GenerateFromNotebookModal from "./GenerateFromNotebookModal";
import NotesUploadModal from "./NotesUploadModal";
import Dropdown from "./Dropdown";
import { NotePreview, NoteTypeIcon, noteTypeLabel } from "./noteVisuals";

type Folder = "all" | "unfiled" | string;
const VIEW_KEY = "catalyst:notesView";

function relative(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days < 1) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

const SORT_OPTIONS: { value: NoteSort; label: string }[] = [
  { value: "recent", label: "Most recent" },
  { value: "title", label: "Title" },
  { value: "class", label: "Class" },
  { value: "notebook", label: "Notebook" },
];

function SelectBox({ checked }: { checked: boolean }) {
  return (
    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${checked ? "border-primary bg-primary text-text-inverse" : "border-border-hover bg-bg-container"}`}>
      {checked && <Check size={13} />}
    </span>
  );
}

function DraggableNote({ id, children }: { id: string; children: (bind: { ref: (el: HTMLElement | null) => void; listeners: object; attributes: object; dragging: boolean }) => React.ReactNode }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: `note:${id}` });
  return <>{children({ ref: setNodeRef, listeners: listeners ?? {}, attributes, dragging: isDragging })}</>;
}

function FolderButton({
  dropId,
  active,
  onClick,
  icon,
  label,
  count,
  badge,
}: {
  dropId: string | null;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
  badge?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId ?? "none-droppable", disabled: !dropId });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={`flex w-auto shrink-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors md:w-full ${
        isOver ? "bg-primary text-text-inverse" : active ? "bg-bg-warm font-medium text-text-main" : "text-text-main hover:bg-bg-main"
      }`}
    >
      {icon}
      <span className="min-w-0 truncate md:flex-1">{label}</span>
      {badge && !isOver && <span className="hidden shrink-0 rounded bg-bg-main px-1.5 text-[10px] text-text-muted lg:inline">{badge}</span>}
      <span className={`shrink-0 text-xs tabular-nums ${isOver ? "" : "text-text-muted"}`}>{count}</span>
    </button>
  );
}

/**
 * The notes library. `courseId` set = a class's Notes tab (that class's
 * notes, plus notebooks holding only that class's notes). Null = the general
 * Notes tab, with a dropdown to narrow it to one class.
 */
export default function NotesLibrary({ courseId: fixedCourseId }: { courseId: string | null }) {
  const { user } = useAuth();
  const router = useRouter();
  const uid = user?.uid;
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scope, setScope] = useState<string>(fixedCourseId ?? "");
  const [folder, setFolder] = useState<Folder>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<NoteSort>("recent");
  const [view, setView] = useState<"list" | "card">("card");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [modal, setModal] = useState<null | "choice" | "typed" | "upload" | "flashcards" | "quiz" | "deleteNotes" | "deleteNotebook">(null);
  const [newNotebookName, setNewNotebookName] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const synced = useRef(false);
  const courseTab = fixedCourseId !== null;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === "list" || saved === "card") setView(saved);
    } catch {}
  }, []);

  useEffect(() => {
    if (!uid) return;
    const offNotes = subscribeNotes(uid, setNotes, (e) => {
      console.error(e);
      setLoadError("Couldn't load your notes. Check your connection and refresh.");
    });
    const offBooks = subscribeNotebooks(uid, setNotebooks, (e) => console.error(e));
    listClasses(uid).then(setClasses).catch((e) => console.error(e));
    return () => {
      offNotes();
      offBooks();
    };
  }, [uid]);

  // Bring in files tagged Notes (and drop entries whose file was deleted).
  // Runs once per visit after the first snapshot (so existing entries are
  // known), and again after an upload. Uses the raw list including hidden
  // entries, so removed documents aren't re-added.
  const notesRef = useRef<Note[] | null>(null);
  notesRef.current = notes;
  const syncNow = useCallback(() => {
    if (!uid || !notesRef.current) return;
    const courseIds = courseTab ? [fixedCourseId!] : classes.map((c) => c.id);
    if (courseIds.length === 0) return;
    syncClassDocuments(uid, courseIds, notesRef.current).catch((e) => console.error("Syncing class documents failed:", e));
  }, [uid, classes, courseTab, fixedCourseId]);
  useEffect(() => {
    if (!notes || synced.current || (!courseTab && classes.length === 0)) return;
    synced.current = true;
    syncNow();
  }, [notes, classes, courseTab, syncNow]);

  const allNotes = useMemo(() => (notes ?? []).filter((n) => !n.hidden), [notes]);
  const scopedNotes = useMemo(() => (scope ? allNotes.filter((n) => n.courseId === scope) : allNotes), [allNotes, scope]);
  const scopedNotebooks = useMemo(
    () => (scope ? notebooks.filter((b) => notebookInCourse(b, scope, allNotes)) : notebooks),
    [notebooks, scope, allNotes]
  );
  const activeNotebook = scopedNotebooks.find((b) => b.id === folder) ?? null;
  useEffect(() => {
    if (folder !== "all" && folder !== "unfiled" && !activeNotebook) setFolder("all");
  }, [folder, activeNotebook]);

  const listed = useMemo(() => {
    const inFolder = scopedNotes.filter((n) => (folder === "all" ? true : folder === "unfiled" ? !n.notebookId : n.notebookId === folder));
    return sortNotes(inFolder.filter((n) => matchesSearch(n, search)), sort, classes, notebooks);
  }, [scopedNotes, folder, search, sort, classes, notebooks]);

  const countIn = (id: string) => allNotes.filter((n) => n.notebookId === id && (!scope || n.courseId === scope)).length;
  const classOf = (id: string | null) => classes.find((c) => c.id === id);
  const notebookBadge = (b: Notebook) => {
    const ids = new Set(allNotes.filter((n) => n.notebookId === b.id).map((n) => n.courseId));
    if (ids.size > 1) return "Multi-class";
    const only = [...ids][0];
    const c = only ? classOf(only) : null;
    return c ? c.classCode || c.className : undefined;
  };

  function setViewSaved(v: "list" | "card") {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function move(ids: string[], notebookId: string | null) {
    if (!uid || ids.length === 0) return;
    try {
      await moveNotesToNotebook(uid, ids, notebookId, allNotes);
      const name = notebookId ? notebooks.find((b) => b.id === notebookId)?.name : null;
      setMessage({ kind: "info", text: `Moved ${ids.length} note${ids.length === 1 ? "" : "s"} ${name ? `to "${name}"` : "out of their notebook"}.` });
      setSelected(new Set());
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof NotebookFullError ? e.message : "Couldn't move those notes. Try again." });
    }
  }

  async function addNotebook() {
    if (!uid || newNotebookName === null) return;
    const name = newNotebookName.trim();
    setNewNotebookName(null);
    if (!name) return;
    const id = await createNotebook(uid, name, scope || null);
    setFolder(id);
  }

  async function confirmDeleteNotes() {
    if (!uid) return;
    setBusy(true);
    try {
      await removeNotes(uid, allNotes.filter((n) => selected.has(n.id)));
      setSelected(new Set());
      setSelectMode(false);
    } finally {
      setBusy(false);
      setModal(null);
    }
  }

  async function confirmDeleteNotebook() {
    if (!uid || !activeNotebook) return;
    setBusy(true);
    try {
      await deleteNotebook(uid, activeNotebook.id, allNotes);
      setFolder("all");
    } finally {
      setBusy(false);
      setModal(null);
    }
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const dragIds = (activeId: string) => (selected.has(activeId) ? [...selected] : [activeId]);

  function onDragStart(e: DragStartEvent) {
    setDraggingId(String(e.active.id).replace(/^note:/, ""));
  }
  function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id).replace(/^note:/, "");
    setDraggingId(null);
    const target = e.over?.id ? String(e.over.id) : null;
    if (!target) return;
    if (target === "folder:unfiled") void move(dragIds(id), null);
    else if (target.startsWith("folder:")) void move(dragIds(id), target.slice(7));
  }

  const openNote = (id: string) => router.push(courseTab ? `/notes/${id}?from=${fixedCourseId}` : `/notes/${id}`);
  const scopedClass = scope ? classOf(scope) : null;

  if (!uid) return null;

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDraggingId(null)}>
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 md:py-8">
        {/* md:pl-12 clears the site's fixed menu button (Sidebar.tsx) when the sidebar is collapsed. */}
        <header className="mb-6 md:pl-12" data-tutorial="notes-heading">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-3xl font-semibold tracking-tight text-text-main">Notes</h1>
            <button
              type="button"
              onClick={() => setModal("choice")}
              className="flex shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-text-inverse shadow-sm hover:bg-primary-hover"
              data-tutorial="notes-upload"
            >
              <Plus size={17} /> Add notes
            </button>
          </div>
          {courseTab ? (
            <p className="mt-1.5 text-sm text-text-muted">{scopedClass ? classLabel(scopedClass) : "This class"}</p>
          ) : (
            <div className="mt-2 flex items-center gap-2">
              <label htmlFor="notes-scope" className="text-sm text-text-muted">
                Showing
              </label>
              <Dropdown
                id="notes-scope"
                value={scope}
                onChange={(v) => {
                  setScope(v);
                  setFolder("all");
                  setSelected(new Set());
                }}
                options={[
                  { value: "", label: "General - all classes" },
                  ...classes.map((c) => ({ value: c.id, label: c.classCode || c.className, hint: c.classCode ? c.className : undefined })),
                ]}
                className="w-60 max-w-[calc(100vw-7rem)]"
                dataTutorial="notes-scope"
              />
            </div>
          )}
        </header>

        {message && (
          <div
            role={message.kind === "error" ? "alert" : "status"}
            className={`mb-4 flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
              message.kind === "error" ? "bg-alert-error-bg text-alert-error" : "bg-alert-success-bg text-alert-success"
            }`}
          >
            <span className="flex-1">{message.text}</span>
            <button type="button" className="font-medium underline" onClick={() => setMessage(null)}>
              Dismiss
            </button>
          </div>
        )}
        {loadError && <p className="mb-4 rounded-lg bg-alert-error-bg px-3 py-2 text-sm text-alert-error">{loadError}</p>}

        <div className="flex flex-col gap-6 md:flex-row">
          <aside className="md:w-60 md:shrink-0" aria-label="Notebooks" data-tutorial="notes-notebooks">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Notebooks</h2>
              <button
                type="button"
                onClick={() => setNewNotebookName("")}
                aria-label="New notebook"
                title="New notebook"
                className="rounded-md p-1 text-text-muted hover:bg-bg-warm hover:text-text-main"
              >
                <FolderPlus size={16} />
              </button>
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible">
              <FolderButton dropId={null} active={folder === "all"} onClick={() => setFolder("all")} icon={<Layers size={16} className="shrink-0" />} label="All notes" count={scopedNotes.length} />
              <FolderButton
                dropId="folder:unfiled"
                active={folder === "unfiled"}
                onClick={() => setFolder("unfiled")}
                icon={<Inbox size={16} className="shrink-0" />}
                label="Not in a notebook"
                count={scopedNotes.filter((n) => !n.notebookId).length}
              />
              {scopedNotebooks.map((b) => (
                <FolderButton
                  key={b.id}
                  dropId={`folder:${b.id}`}
                  active={folder === b.id}
                  onClick={() => setFolder(b.id)}
                  icon={<BookCopy size={16} className="shrink-0" />}
                  label={b.name}
                  count={countIn(b.id)}
                  badge={scope ? undefined : notebookBadge(b)}
                />
              ))}
              {newNotebookName !== null && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void addNotebook();
                  }}
                  className="flex shrink-0 items-center gap-1 px-1 py-1"
                >
                  <input
                    autoFocus
                    value={newNotebookName}
                    onChange={(e) => setNewNotebookName(e.target.value)}
                    onBlur={() => void addNotebook()}
                    onKeyDown={(e) => e.key === "Escape" && setNewNotebookName(null)}
                    placeholder="Notebook name"
                    aria-label="New notebook name"
                    maxLength={60}
                    className="w-full min-w-[140px] rounded-md border border-primary bg-bg-container px-2 py-1.5 text-sm text-text-main outline-none"
                  />
                </form>
              )}
            </div>
            {scopedNotebooks.length === 0 && newNotebookName === null && (
              <button
                type="button"
                onClick={() => setNewNotebookName("")}
                className="mt-3 hidden w-full flex-col gap-1 rounded-xl border border-dashed border-border-hover p-3 text-left transition-colors hover:border-primary hover:bg-bg-warm md:flex"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-text-main">
                  <FolderPlus size={16} className="text-primary" /> New notebook
                </span>
                <span className="text-xs leading-relaxed text-text-muted">
                  Group notes by topic or exam - a notebook can mix classes. Drag notes onto it, or select several and use Move.
                </span>
              </button>
            )}
          </aside>

          <section className="min-w-0 flex-1">
            {activeNotebook && (
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border-light bg-bg-container p-3">
                {renaming === activeNotebook.id ? (
                  <input
                    autoFocus
                    defaultValue={activeNotebook.name}
                    aria-label="Notebook name"
                    maxLength={60}
                    onBlur={(e) => {
                      setRenaming(null);
                      if (e.target.value.trim() && e.target.value !== activeNotebook.name) void renameNotebook(uid, activeNotebook.id, e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    className="min-w-0 flex-1 rounded-md border border-primary bg-bg-container px-2 py-1 text-base font-semibold text-text-main outline-none"
                  />
                ) : (
                  <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-text-main">{activeNotebook.name}</h2>
                )}
                <span className="text-xs tabular-nums text-text-muted">
                  {countIn(activeNotebook.id)} / {MAX_NOTES_PER_NOTEBOOK} notes
                </span>
                <button
                  type="button"
                  onClick={() => setModal("flashcards")}
                  disabled={countIn(activeNotebook.id) === 0}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-text-inverse hover:bg-primary-hover disabled:opacity-40"
                >
                  <Layers size={14} /> Make flashcards
                </button>
                <button
                  type="button"
                  onClick={() => setModal("quiz")}
                  disabled={countIn(activeNotebook.id) === 0}
                  className="flex items-center gap-1.5 rounded-lg border border-border-light px-3 py-1.5 text-xs font-medium text-text-main hover:bg-bg-warm disabled:opacity-40"
                >
                  <GraduationCap size={14} /> Make quiz
                </button>
                <button type="button" onClick={() => setRenaming(activeNotebook.id)} aria-label="Rename notebook" title="Rename" className="rounded-lg p-1.5 text-text-muted hover:bg-bg-warm hover:text-text-main">
                  <Pencil size={15} />
                </button>
                <button type="button" onClick={() => setModal("deleteNotebook")} aria-label="Delete notebook" title="Delete notebook" className="rounded-lg p-1.5 text-text-muted hover:bg-alert-error-bg hover:text-alert-error">
                  <Trash2 size={15} />
                </button>
              </div>
            )}

            <div className="mb-4 flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1" data-tutorial="notes-search">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search titles and contents"
                  aria-label="Search notes"
                  className="w-full rounded-lg border border-border-light bg-bg-container py-2 pl-9 pr-3 text-sm text-text-main focus:border-primary focus:outline-none"
                />
              </div>
              <Dropdown value={sort} onChange={setSort} options={SORT_OPTIONS} ariaLabel="Sort notes" icon={<ArrowUpDown size={14} />} align="right" className="w-40" />
              <div className="flex rounded-lg border border-border-light bg-bg-container p-0.5" role="group" aria-label="View">
                <button type="button" onClick={() => setViewSaved("card")} aria-pressed={view === "card"} aria-label="Card view" className={`rounded-md p-1.5 ${view === "card" ? "bg-bg-warm text-text-main" : "text-text-muted"}`}>
                  <LayoutGrid size={16} />
                </button>
                <button type="button" onClick={() => setViewSaved("list")} aria-pressed={view === "list"} aria-label="List view" className={`rounded-md p-1.5 ${view === "list" ? "bg-bg-warm text-text-main" : "text-text-muted"}`}>
                  <List size={16} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectMode((s) => !s);
                  setSelected(new Set());
                }}
                aria-pressed={selectMode}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm ${selectMode ? "border-primary bg-bg-warm text-primary" : "border-border-light bg-bg-container text-text-main hover:bg-bg-warm"}`}
              >
                <CheckSquare size={15} /> Select
              </button>
            </div>

            {selectMode && (
              <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-navy px-3 py-2 text-sm text-white shadow-md">
                <span className="font-medium tabular-nums">{selected.size} selected</span>
                <button type="button" className="rounded-md px-2 py-1 text-white/80 hover:bg-white/10" onClick={() => setSelected(new Set(listed.map((n) => n.id)))}>
                  Select all
                </button>
                <span className="flex-1" />
                <select
                  value=""
                  disabled={selected.size === 0}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) void move([...selected], v === "__none" ? null : v);
                  }}
                  aria-label="Move selected notes to a notebook"
                  className="rounded-md bg-white/10 px-2 py-1 text-sm text-white disabled:opacity-40 [&>option]:text-black"
                >
                  <option value="">Move to...</option>
                  {notebooks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                  <option value="__none">Out of notebook</option>
                </select>
                <button
                  type="button"
                  disabled={selected.size === 0}
                  onClick={() => setModal("deleteNotes")}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-white hover:bg-white/10 disabled:opacity-40"
                >
                  <Trash2 size={14} /> Remove
                </button>
              </div>
            )}

            {notes === null ? (
              <div className="flex items-center gap-2 py-16 text-sm text-text-muted">
                <Loader2 size={16} className="animate-spin" /> Loading notes...
              </div>
            ) : listed.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border-light px-6 py-14 text-center">
                <NotebookText size={28} className="mx-auto text-text-muted" />
                <p className="mt-3 text-sm font-medium text-text-main">
                  {search ? "No notes match your search." : activeNotebook ? "This notebook is empty." : "No notes yet."}
                </p>
                <p className="mt-1 text-sm text-text-muted">
                  {search
                    ? "Try a different word - search looks through titles and what's written inside."
                    : activeNotebook
                      ? "Drag notes here, or select notes and choose Move to."
                      : "Type a note, or scan and upload your handwritten notes."}
                </p>
              </div>
            ) : view === "card" ? (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {listed.map((n) => {
                  const c = classOf(n.courseId);
                  const book = n.notebookId ? notebooks.find((b) => b.id === n.notebookId) : undefined;
                  return (
                    <DraggableNote key={n.id} id={n.id}>
                      {({ ref, listeners, attributes, dragging }) => (
                        <li
                          ref={ref}
                          {...listeners}
                          {...attributes}
                          className={`group relative flex cursor-pointer select-none flex-col overflow-hidden rounded-2xl border bg-bg-container text-left shadow-sm transition ${
                            selected.has(n.id) ? "border-primary ring-1 ring-primary" : "border-border-light hover:border-border-hover hover:shadow-md"
                          } ${dragging ? "opacity-40" : ""}`}
                          onClick={() => (selectMode ? toggle(n.id) : openNote(n.id))}
                          onKeyDown={(e) => e.key === "Enter" && (selectMode ? toggle(n.id) : openNote(n.id))}
                          role="button"
                          tabIndex={0}
                          aria-label={`${n.title}${selectMode ? (selected.has(n.id) ? ", selected" : ", not selected") : ""}`}
                        >
                          <div className="relative h-32 overflow-hidden border-b border-border-light bg-bg-main">
                            <NotePreview uid={uid} note={n} />
                            {(selectMode || selected.has(n.id)) && (
                              <span className="absolute right-2.5 top-2.5">
                                <SelectBox checked={selected.has(n.id)} />
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col gap-1.5 px-3.5 py-3">
                            <div className="flex items-center gap-2.5">
                              <NoteTypeIcon note={n} size="sm" />
                              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-main" title={n.title}>
                                {n.title}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-text-muted">
                              {c && <span className="shrink-0 rounded bg-bg-main px-1.5 py-0.5">{c.classCode || c.className}</span>}
                              {book ? (
                                <span className="flex min-w-0 items-center gap-1 truncate">
                                  <BookCopy size={12} className="shrink-0" /> <span className="truncate">{book.name}</span>
                                </span>
                              ) : (
                                <span className="truncate">{noteTypeLabel(n)}</span>
                              )}
                              <span className="ml-auto shrink-0 tabular-nums">{relative(n.updatedAt)}</span>
                            </div>
                          </div>
                        </li>
                      )}
                    </DraggableNote>
                  );
                })}
              </ul>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border-light bg-bg-container">
                <div className="flex items-center gap-3 border-b border-border-light bg-bg-main px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted" aria-hidden="true">
                  {selectMode && <span className="w-5 shrink-0" />}
                  <span className="min-w-0 flex-1 pl-10">Name</span>
                  <span className="hidden w-32 sm:block">Class</span>
                  <span className="hidden w-32 md:block">Notebook</span>
                  <span className="w-20 shrink-0 text-right">Edited</span>
                </div>
                <ul className="divide-y divide-border-light">
                  {listed.map((n) => {
                    const c = classOf(n.courseId);
                    return (
                      <DraggableNote key={n.id} id={n.id}>
                        {({ ref, listeners, attributes, dragging }) => (
                          <li
                            ref={ref}
                            {...listeners}
                            {...attributes}
                            role="button"
                            tabIndex={0}
                            aria-label={`${n.title}${selectMode ? (selected.has(n.id) ? ", selected" : ", not selected") : ""}`}
                            onClick={() => (selectMode ? toggle(n.id) : openNote(n.id))}
                            onKeyDown={(e) => e.key === "Enter" && (selectMode ? toggle(n.id) : openNote(n.id))}
                            className={`flex cursor-pointer select-none items-center gap-3 px-4 py-2.5 transition ${selected.has(n.id) ? "bg-bg-warm" : "hover:bg-bg-main"} ${dragging ? "opacity-40" : ""}`}
                          >
                            {selectMode && <SelectBox checked={selected.has(n.id)} />}
                            <NoteTypeIcon note={n} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-text-main">{n.title}</span>
                              <span className="block truncate text-xs text-text-muted">
                                {n.kind === "typed" ? (n.plainText || "Empty note").replace(/\s+/g, " ") : noteTypeLabel(n)}
                              </span>
                            </span>
                            <span className="hidden w-32 truncate text-xs text-text-muted sm:block">{c ? c.classCode || c.className : "General"}</span>
                            <span className="hidden w-32 truncate text-xs text-text-muted md:block">{notebooks.find((b) => b.id === n.notebookId)?.name ?? ""}</span>
                            <span className="w-20 shrink-0 text-right text-xs tabular-nums text-text-muted">{relative(n.updatedAt)}</span>
                          </li>
                        )}
                      </DraggableNote>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        </div>
      </div>

      <DragOverlay>
        {draggingId && (
          <div className="rounded-xl bg-navy px-3 py-2 text-sm font-medium text-white shadow-lg">
            {selected.has(draggingId) && selected.size > 1 ? `Moving ${selected.size} notes` : `Moving "${allNotes.find((n) => n.id === draggingId)?.title}"`}
          </div>
        )}
      </DragOverlay>

      {modal === "choice" && <AddNoteChoiceModal onClose={() => setModal(null)} onChoose={(c) => setModal(c === "ocr" ? "upload" : "typed")} />}
      {modal === "typed" && (
        <CreateNoteModal
          uid={uid}
          classes={classes}
          notebooks={notebooks}
          notes={allNotes}
          defaultCourseId={scope || null}
          defaultNotebookId={activeNotebook?.id ?? null}
          lockCourse={courseTab}
          onClose={() => setModal(null)}
          onCreated={(id) => openNote(id)}
        />
      )}
      {modal === "upload" && (
        <NotesUploadModal
          uid={uid}
          classes={classes}
          defaultCourseId={scope || null}
          lockCourse={courseTab}
          onClose={() => setModal(null)}
          onUploaded={() => {
            setModal(null);
            syncNow(); // the upload has finished writing - pick up the new files
            setMessage({ kind: "info", text: "Uploaded. Files tagged Notes appear here once they're saved; scanned pages are read in the background." });
          }}
        />
      )}
      {(modal === "flashcards" || modal === "quiz") && activeNotebook && (
        <GenerateFromNotebookModal
          kind={modal}
          notebook={activeNotebook}
          notes={allNotes.filter((n) => n.notebookId === activeNotebook.id)}
          classes={classes}
          onClose={() => setModal(null)}
        />
      )}
      {(modal === "deleteNotes" || modal === "deleteNotebook") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !busy && setModal(null)}>
          <div role="alertdialog" aria-modal="true" className="w-full max-w-sm rounded-2xl bg-bg-container p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-text-main">{modal === "deleteNotes" ? `Remove ${selected.size} note${selected.size === 1 ? "" : "s"}?` : `Delete "${activeNotebook?.name}"?`}</h3>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              {modal === "deleteNotes"
                ? "Typed notes are deleted. Documents only leave the Notes tab along with your drawings on them - the files stay in their class."
                : "The notebook is deleted. Its notes aren't - they move to Not in a notebook."}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setModal(null)} className="rounded-lg px-3 py-2 text-sm text-text-main hover:bg-bg-warm">
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void (modal === "deleteNotes" ? confirmDeleteNotes() : confirmDeleteNotebook())}
                className="flex items-center gap-1.5 rounded-lg bg-alert-error px-3 py-2 text-sm font-medium text-white hover:bg-alert-error-hover disabled:opacity-50"
              >
                {busy && <Loader2 size={14} className="animate-spin" />} {modal === "deleteNotes" ? "Remove" : "Delete notebook"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DndContext>
  );
}
