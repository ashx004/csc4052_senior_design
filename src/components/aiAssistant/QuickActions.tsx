"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, CalendarPlus, FileSearch, FileText, Gauge, ListChecks, NotebookPen, X } from "lucide-react";
import type { ChatClass } from "@/src/library/chatContext";
import type { CustomType } from "@/src/library/custom/customRequest";
import type { StudyKind } from "@/src/library/studySets/setupRules";
import StudyLaunch from "@/src/components/learning/StudyLaunch";

// Quick actions above the chat box: a reminder of what the assistant can do,
// and a way to ask for it without ambiguity. Each action collects the class,
// the source file and a short description, then sends an ordinary message
// that names them exactly - the model no longer has to guess which class or
// file the student meant, which was the most common source of wrong answers
// in testing (2026-09-25).

type Field = "class" | "file" | "count" | "focus" | "title" | "when" | "duration" | "query";

interface QuickAction {
  id: string;
  label: string;
  icon: ReactNode;
  /** Shown under the form's heading. */
  hint: string;
  fields: Field[];
  /** A file is required (the practice exam and notes are generated from a chosen one). */
  needsFile?: boolean;
  /** Opens the Learning page's own flow (source picker, setup, custom sets) instead of sending a chat message. */
  launchKind?: StudyKind;
  /** Where to build a one-off set from the student's own files or prompt, with no class. */
  customType?: CustomType;
  submitLabel: string;
  build?: (v: Values) => string;
}

interface Values {
  classLabel: string;
  file: string;
  count: string;
  focus: string;
  title: string;
  date: string;
  time: string;
  duration: string;
  query: string;
}

const UNREADABLE = new Set(["zip", "class", "jar", "exe", "tar", "gz", "7z", "rar"]);
const quoteFile = (f: string) => `"${f}"`;
const focusPart = (f: string) => (f.trim() ? ` Focus on: ${f.trim()}.` : "");

const ACTIONS: QuickAction[] = [
  {
    id: "quiz",
    label: "Make a quiz",
    icon: <ListChecks size={15} />,
    hint: "Pick one or more files or notes from a class, set the difficulty, and it's saved to that class's quizzes.",
    fields: ["class"],
    launchKind: "quiz",
    customType: "quiz",
    submitLabel: "Choose sources",
  },
  {
    id: "flashcards",
    label: "Flashcards",
    icon: <BookOpen size={15} />,
    hint: "Pick one or more files or notes from a class and get a deck ready to study.",
    fields: ["class"],
    launchKind: "flashcards",
    customType: "flashcards",
    submitLabel: "Choose sources",
  },
  {
    id: "exam",
    label: "Practice exam",
    icon: <FileText size={15} />,
    hint: "A downloadable practice exam PDF, saved to your class files. Longer exams take a minute or two to write.",
    fields: ["class", "file", "count", "focus"],
    customType: "practice",
    submitLabel: "Create practice exam",
    build: (v) =>
      `Create a practice exam PDF with ${v.count} questions for ${v.classLabel}${v.file ? `, based on ${quoteFile(v.file)}` : ", based on my class files"}.${focusPart(v.focus)}`,
  },
  {
    id: "notes",
    label: "Formatted notes",
    icon: <NotebookPen size={15} />,
    hint: "Clean, formatted notes saved to your Notes tab, where you can keep editing them.",
    fields: ["class", "file", "title", "focus"],
    submitLabel: "Write notes",
    build: (v) =>
      `Write formatted study notes${v.focus.trim() ? ` on ${v.focus.trim()}` : ""} for ${v.classLabel}${v.file ? ` from ${quoteFile(v.file)}` : ""}, and save them as a note called "${v.title.trim() || "Study notes"}".`,
  },
  {
    id: "study-time",
    label: "Plan study time",
    icon: <CalendarPlus size={15} />,
    hint: "Adds a study session to your calendar.",
    fields: ["class", "when", "duration", "focus"],
    submitLabel: "Add to calendar",
    build: (v) =>
      `Add a ${v.duration} study session for ${v.classLabel} to my calendar on ${formatDate(v.date)} at ${formatTime(v.time)}.${v.focus.trim() ? ` It's for: ${v.focus.trim()}.` : ""}`,
  },
  {
    id: "progress",
    label: "How am I doing?",
    icon: <Gauge size={15} />,
    hint: "Your confidence in a class, from your Catalyst quiz results and your own rating.",
    fields: ["class"],
    submitLabel: "Check",
    build: (v) => (v.classLabel === ALL_CLASSES ? "How am I doing in my classes? What should I review?" : `How am I doing in ${v.classLabel}? What should I review?`),
  },
  {
    id: "find",
    label: "Find in my files",
    icon: <FileSearch size={15} />,
    hint: "Searches the text of your class files and tells you where a topic is covered.",
    fields: ["class", "query"],
    submitLabel: "Search",
    build: (v) => `Which of my ${v.classLabel === ALL_CLASSES ? "" : `${v.classLabel} `}files cover ${v.query.trim()}?`,
  },
];

const ALL_CLASSES = "all my classes";

function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}
function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  const suffix = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, "0")} ${suffix}`;
}
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const inputClass =
  "w-full min-w-0 rounded-lg border border-border-light bg-bg-container px-3 py-2 text-sm text-text-main outline-none focus:border-primary";

export default function QuickActions({
  classes,
  defaultCourseId,
  disabled,
  onSend,
  compact = false,
}: {
  classes: ChatClass[];
  /** Pre-selects this class (e.g. on a course page). */
  defaultCourseId?: string | null;
  disabled?: boolean;
  onSend: (prompt: string) => void;
  /** Narrow panels: one column, whatever the window width. */
  compact?: boolean;
}) {
  const current = useMemo(() => classes.filter((c) => c.status !== "completed"), [classes]);
  const [openForm, setActive] = useState<{ action: QuickAction; path: string | null } | null>(null);
  const [courseId, setCourseId] = useState<string>("");
  const [values, setValues] = useState<Omit<Values, "classLabel">>({ file: "", count: "10", focus: "", title: "", date: todayIso(), time: "18:00", duration: "1 hour", query: "" });
  const panelRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  // The study flow routes to the new set; the form shouldn't still be open on the next page.
  const active = openForm && openForm.path === pathname ? openForm.action : null;

  useEffect(() => {
    if (!active) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setActive(null);
    window.addEventListener("keydown", close);
    panelRef.current?.querySelector<HTMLElement>("select, input, textarea")?.focus();
    return () => window.removeEventListener("keydown", close);
  }, [active]);

  const selectedClass = current.find((c) => c.classId === courseId);
  const files = (selectedClass?.documents ?? []).filter((d) => !UNREADABLE.has((d.fileType || "").toLowerCase()));

  function open(action: QuickAction) {
    const allowAll = action.id === "progress" || action.id === "find";
    const preferred = current.find((c) => c.classId === defaultCourseId)?.classId ?? (allowAll ? "" : current[0]?.classId ?? "");
    setCourseId(preferred);
    setValues((v) => ({ ...v, file: "", focus: "", title: "", query: "", count: action.id === "exam" ? "15" : "10" }));
    setActive({ action, path: pathname });
  }

  function submit() {
    if (!active) return;
    const cls = current.find((c) => c.classId === courseId);
    const classLabel = cls ? cls.classCode || cls.className : ALL_CLASSES;
    if (!active.build) return;
    onSend(active.build({ ...values, classLabel }));
    setActive(null);
  }

  const missing =
    !active
      ? true
      : (active.fields.includes("class") && !["progress", "find"].includes(active.id) && !courseId) ||
        (active.needsFile && !values.file) ||
        (active.fields.includes("query") && !values.query.trim()) ||
        (active.fields.includes("when") && (!values.date || !values.time));

  const wide = compact ? "" : "sm:col-span-2";

  if (current.length === 0) return null;

  return (
    <div className="mx-auto mb-2 max-w-4xl">
      {active && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={active.label}
          className="mb-2 rounded-2xl border border-border-light bg-bg-container p-4 shadow-lg shadow-stone-200/60"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-text-main">
                <span className="text-primary">{active.icon}</span> {active.label}
              </p>
              <p className="mt-0.5 text-xs text-text-muted">{active.hint}</p>
            </div>
            <button type="button" onClick={() => setActive(null)} aria-label="Close" className="rounded-md p-1 text-text-muted hover:bg-bg-warm">
              <X size={16} />
            </button>
          </div>

          {/* In compact mode a col-span would create an implicit second column. */}
          <div className={compact ? "grid grid-cols-1 gap-3" : "grid gap-3 sm:grid-cols-2"}>
            {active.fields.includes("class") && (
              <label className="grid gap-1 text-xs font-medium text-text-muted">
                Class
                <select
                  id="qa-class"
                  value={courseId}
                  onChange={(e) => {
                    setCourseId(e.target.value);
                    setValues((v) => ({ ...v, file: "" }));
                  }}
                  className={inputClass}
                >
                  {["progress", "find"].includes(active.id) ? <option value="">All my classes</option> : <option value="" disabled>Choose a class</option>}
                  {current.map((c) => (
                    <option key={c.classId} value={c.classId}>
                      {c.classCode ? `${c.classCode} - ${c.className}` : c.className}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {active.fields.includes("file") && (
              <label className="grid gap-1 text-xs font-medium text-text-muted">
                {active.needsFile ? "From file" : "From file (optional)"}
                <select
                  id="qa-file"
                  value={values.file}
                  onChange={(e) => setValues((v) => ({ ...v, file: e.target.value }))}
                  disabled={!selectedClass}
                  className={inputClass}
                >
                  <option value="">{active.needsFile ? (files.length ? "Choose a file" : "No readable files in this class") : "All class files"}</option>
                  {files.map((d) => (
                    <option key={d.resourceId} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {active.fields.includes("count") && (
              <label className="grid gap-1 text-xs font-medium text-text-muted">
                Questions
                <select id="qa-count" value={values.count} onChange={(e) => setValues((v) => ({ ...v, count: e.target.value }))} className={inputClass}>
                  {["5", "10", "15", "20"].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {active.fields.includes("title") && (
              <label className="grid gap-1 text-xs font-medium text-text-muted">
                Note title
                <input
                  id="qa-title"
                  value={values.title}
                  onChange={(e) => setValues((v) => ({ ...v, title: e.target.value.slice(0, 80) }))}
                  placeholder="e.g. Exam 2 - sorting"
                  className={inputClass}
                />
              </label>
            )}

            {active.fields.includes("when") && (
              <div className="grid min-w-0 grid-cols-2 gap-2">
                <label className="grid gap-1 text-xs font-medium text-text-muted">
                  Day
                  <input id="qa-date" type="date" value={values.date} onChange={(e) => setValues((v) => ({ ...v, date: e.target.value }))} className={inputClass} />
                </label>
                <label className="grid gap-1 text-xs font-medium text-text-muted">
                  Time
                  <input id="qa-time" type="time" value={values.time} onChange={(e) => setValues((v) => ({ ...v, time: e.target.value }))} className={inputClass} />
                </label>
              </div>
            )}

            {active.fields.includes("duration") && (
              <label className="grid gap-1 text-xs font-medium text-text-muted">
                Length
                <select id="qa-duration" value={values.duration} onChange={(e) => setValues((v) => ({ ...v, duration: e.target.value }))} className={inputClass}>
                  {["30 minute", "1 hour", "90 minute", "2 hour"].map((d) => (
                    <option key={d} value={d}>
                      {d.replace("minute", "minutes").replace(/^1 hour$/, "1 hour").replace(/^2 hour$/, "2 hours")}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {active.fields.includes("query") && (
              <label className={`grid gap-1 text-xs font-medium text-text-muted ${wide}`}>
                What are you looking for?
                <input
                  id="qa-query"
                  value={values.query}
                  onChange={(e) => setValues((v) => ({ ...v, query: e.target.value.slice(0, 200) }))}
                  onKeyDown={(e) => e.key === "Enter" && !missing && (e.preventDefault(), submit())}
                  placeholder="e.g. amortized analysis of dynamic arrays"
                  className={inputClass}
                />
              </label>
            )}

            {active.fields.includes("focus") && (
              <label className={`grid gap-1 text-xs font-medium text-text-muted ${wide}`}>
                {active.id === "notes" ? "Topic" : active.id === "study-time" ? "What you'll study (optional)" : "Anything to focus on? (optional)"}
                <input
                  id="qa-focus"
                  value={values.focus}
                  onChange={(e) => setValues((v) => ({ ...v, focus: e.target.value.slice(0, 200) }))}
                  onKeyDown={(e) => e.key === "Enter" && !missing && (e.preventDefault(), submit())}
                  placeholder={active.id === "notes" ? "e.g. how radix sort works" : "e.g. casting and type conversions"}
                  className={inputClass}
                />
              </label>
            )}
          </div>

          {active.customType && (
            <p className="mt-3 text-xs text-text-muted">
              Not tied to a class? Make a one-off {active.customType === "practice" ? "practice exam" : active.customType} from your own files or a prompt:{" "}
              <Link href={`/custom/new?type=${active.customType}`} className="font-medium text-primary hover:underline">
                Make a custom {active.customType === "practice" ? "practice exam" : active.customType}
              </Link>
            </p>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setActive(null)} className="rounded-lg px-3 py-2 text-sm text-text-muted hover:bg-bg-warm">
              Cancel
            </button>
            {active.launchKind && courseId ? (
              // The same source picker, setup and custom-set options as the Learning page.
              <StudyLaunch key={`${courseId}-${active.id}`} courseId={courseId} variant="compact" initialKind={active.launchKind}>
                {(openFlow) => (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => openFlow(active.launchKind)}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-text-inverse hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {active.submitLabel}
                  </button>
                )}
              </StudyLaunch>
            ) : (
              <button
                type="button"
                disabled={missing || disabled || !active.build}
                onClick={submit}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-text-inverse hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {active.submitLabel}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible" role="toolbar" aria-label="Quick actions" data-tutorial="ai-quick-actions">
        {ACTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            disabled={disabled}
            onClick={() => (active?.id === a.id ? setActive(null) : open(a))}
            aria-pressed={active?.id === a.id}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
              active?.id === a.id
                ? "border-primary bg-primary text-text-inverse"
                : "border-border-light bg-bg-container text-text-main hover:border-border-hover hover:bg-bg-warm"
            }`}
          >
            <span className={active?.id === a.id ? "" : "text-primary"}>{a.icon}</span>
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
