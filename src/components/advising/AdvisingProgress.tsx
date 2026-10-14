"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { AlertTriangle, CheckCircle2, ChevronDown, Circle, Clock, HelpCircle, Loader2 } from "lucide-react";
import { db } from "@/src/library/firebase";
import {
  isInProgress,
  summarizeProgress,
  type CurriculumData,
  type ProgressSummary,
  type RequirementProgress,
  type RequirementState,
  type TranscriptCourse,
  type TranscriptData,
} from "@/src/library/advising/progress";

const STATE_META: Record<RequirementState, { label: string; chip: string; icon: typeof Circle; tone: string }> = {
  done: { label: "Done", chip: "Done", icon: CheckCircle2, tone: "text-alert-success" },
  "in-progress": { label: "In progress", chip: "In progress", icon: Clock, tone: "text-primary" },
  remaining: { label: "Still to take", chip: "To take", icon: Circle, tone: "text-text-muted" },
  review: { label: "To plan yourself", chip: "To plan", icon: HelpCircle, tone: "text-text-muted" },
};
const FILTERS: ("all" | RequirementState)[] = ["all", "done", "in-progress", "remaining", "review"];

function ProgressRing({ percent }: { percent: number | null }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const shown = percent ?? 0;
  return (
    <div className="relative h-28 w-28 shrink-0" role="img" aria-label={percent === null ? "Degree progress unknown" : `${percent} percent of degree credits earned`}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="9" className="stroke-border-light" />
        <circle
          cx="50" cy="50" r={radius} fill="none" strokeWidth="9" strokeLinecap="round"
          className="stroke-primary transition-[stroke-dashoffset] duration-700 ease-out"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - shown / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold text-text-main">{percent === null ? "-" : `${percent}%`}</span>
        <span className="text-[10px] uppercase tracking-wide text-text-muted">earned</span>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-[7rem]">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="text-xl font-semibold text-text-main">{value}</p>
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  );
}

function RequirementRow({ requirement }: { requirement: RequirementProgress }) {
  const meta = STATE_META[requirement.state];
  const Icon = meta.icon;
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border-light bg-bg-container px-4 py-3">
      <Icon size={18} className={`mt-0.5 shrink-0 ${meta.tone}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-main">{requirement.name}</p>
        <p className="mt-0.5 text-xs leading-5 text-text-muted">{requirement.detail}</p>
      </div>
      <span className={`shrink-0 rounded-full bg-bg-warm px-2.5 py-0.5 text-[11px] font-medium ${meta.tone}`}>{meta.chip}</span>
    </li>
  );
}

function gradeBadge(course: TranscriptCourse) {
  if (isInProgress(course)) return "In progress";
  return course.grade?.trim() || (course.status === "transfer" ? "Transfer" : "-");
}

function CoursesTaken({ summary }: { summary: ProgressSummary }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // Newest terms first and open, since that's what a student comes back to look at.
  const terms = [...summary.terms].reverse();
  return (
    <div className="space-y-2">
      {terms.map((term, index) => {
        const isOpen = open[term.label] ?? index === 0;
        return (
          <section key={term.label} className="overflow-hidden rounded-lg border border-border-light bg-bg-container">
            <button
              type="button"
              onClick={() => setOpen((o) => ({ ...o, [term.label]: !isOpen }))}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-bg-warm"
            >
              <ChevronDown size={16} className={`shrink-0 text-text-muted transition-transform ${isOpen ? "" : "-rotate-90"}`} aria-hidden />
              <span className="flex-1 text-sm font-semibold text-text-main">{term.label}</span>
              <span className="text-xs text-text-muted">{term.courses.length} {term.courses.length === 1 ? "course" : "courses"} - {term.credits} credits</span>
            </button>
            {isOpen && (
              <ul className="divide-y divide-border-light border-t border-border-light">
                {term.courses.map((course, i) => (
                  <li key={`${course.courseCode}-${i}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="w-24 shrink-0 font-medium text-text-main">{course.courseCode}</span>
                    <span className="min-w-0 flex-1 truncate text-text-muted">{course.courseTitle ?? ""}</span>
                    <span className="w-16 shrink-0 text-right text-xs text-text-muted">{course.creditHours ?? "-"} cr</span>
                    <span className="w-20 shrink-0 text-right text-xs font-medium text-text-main">{gradeBadge(course)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/**
 * What the scan found in the transcript and curriculum sheet, as a quick read:
 * progress toward the degree, which requirements are met, every course taken
 * by term, and anything worth double-checking. Reads the saved results, so it
 * is there instantly when the student comes back.
 */
export default function AdvisingProgress({ uid, refreshKey = 0 }: { uid: string; refreshKey?: number }) {
  const [data, setData] = useState<{ transcript: TranscriptData; curriculum: CurriculumData } | null | "none">(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"requirements" | "courses">("requirements");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");

  useEffect(() => {
    let cancelled = false;
    Promise.all([getDoc(doc(db, "users", uid, "transcript", "data")), getDoc(doc(db, "users", uid, "curriculum", "data"))])
      .then(([transcript, curriculum]) => {
        if (cancelled) return;
        setError("");
        setData(transcript.exists() && curriculum.exists() ? { transcript: transcript.data() as TranscriptData, curriculum: curriculum.data() as CurriculumData } : "none");
      })
      .catch(() => !cancelled && setError("Couldn't load your results. Refresh to try again."));
    return () => {
      cancelled = true;
    };
  }, [uid, refreshKey]);

  const summary = useMemo(() => (data && data !== "none" ? summarizeProgress(data.transcript, data.curriculum) : null), [data]);

  if (error) return <p role="alert" className="mt-8 rounded-lg border border-alert-error bg-alert-error-bg px-4 py-3 text-sm text-alert-error">{error}</p>;
  if (data === null) {
    return <p className="mt-8 flex items-center gap-2 text-sm text-text-muted"><Loader2 size={14} className="animate-spin" /> Loading your results...</p>;
  }
  if (data === "none" || !summary) {
    return (
      <section className="mt-8 rounded-xl border border-dashed border-border-hover bg-bg-container p-6 text-sm text-text-muted">
        Your files haven&apos;t been read yet. Replace them above to scan them again.
      </section>
    );
  }

  const { transcript, curriculum } = data;
  const subtitle = [curriculum.degreeName ?? curriculum.programName, transcript.major, transcript.concentration, (curriculum.catalogYear ?? transcript.catalogYear) && `Catalog ${curriculum.catalogYear ?? transcript.catalogYear}`]
    // Skip a part already said inside another ("Computer Science" within "BS in Computer Science").
    .filter((part, i, all) => part && !all.some((other, j) => j !== i && other && (other.toLowerCase().includes(part.toLowerCase()) && (other.length > part.length || j < i))))
    .join("  -  ");
  const remainingCredits = summary.creditsRequired ? Math.max(0, summary.creditsRequired - summary.creditsEarned - summary.creditsInProgress) : null;
  const visible = summary.requirements.filter((r) => filter === "all" || r.state === filter);
  const groups = (["program", "concentration"] as const).map((group) => ({ group, rows: visible.filter((r) => r.group === group) })).filter((g) => g.rows.length > 0);

  return (
    <section className="mt-8" aria-label="Degree progress" data-tutorial="advising-new-progress">
      <div className="rounded-2xl border border-border-light bg-bg-container p-6 shadow-sm">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <ProgressRing percent={summary.percentEarned} />
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold text-text-main">{transcript.studentName ? `${transcript.studentName}'s progress` : "Your degree progress"}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-text-muted">{subtitle}</p>}
            <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
              <Stat label="Credits earned" value={String(summary.creditsEarned)} hint={summary.creditsRequired ? `of ${summary.creditsRequired}` : undefined} />
              <Stat label="In progress" value={String(summary.creditsInProgress)} hint="credits this term" />
              {remainingCredits !== null && <Stat label="Still to go" value={String(remainingCredits)} hint="credits" />}
              <Stat label="GPA" value={summary.gpa === null ? "-" : summary.gpa.toFixed(2)} hint={summary.gpa === null ? "no letter grades" : "from your transcript"} />
            </div>
          </div>
        </div>
      </div>

      {summary.attention.length > 0 && (
        <div className="mt-4 rounded-xl border border-border-hover bg-bg-warm p-4" role="note">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-text-main"><AlertTriangle size={15} className="text-primary" aria-hidden /> Worth a second look</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-text-main">
            {summary.attention.slice(0, 5).map((note) => <li key={note}>{note}</li>)}
          </ul>
          {summary.attention.length > 5 && <p className="mt-2 text-xs text-text-muted">and {summary.attention.length - 5} more</p>}
        </div>
      )}

      <div className="mt-6 flex gap-1 border-b border-border-light" role="tablist" aria-label="Results">
        {([["requirements", `Requirements (${summary.requirements.length})`], ["courses", `Courses taken (${transcript.courses.length})`]] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`border-b-2 px-3 py-2 text-sm ${tab === id ? "border-primary font-medium text-primary" : "border-transparent text-text-muted hover:text-text-main"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4" role="tabpanel">
        {tab === "courses" ? (
          <CoursesTaken summary={summary} />
        ) : summary.requirements.length === 0 ? (
          <p className="rounded-lg bg-bg-container p-4 text-sm text-text-muted">No requirements were found on your curriculum sheet.</p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              {FILTERS.map((id) => {
                const count = id === "all" ? summary.requirements.length : summary.counts[id];
                if (id !== "all" && count === 0) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={filter === id}
                    onClick={() => setFilter(id)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === id ? "border-primary bg-primary text-text-inverse" : "border-border-light bg-bg-container text-text-main hover:bg-bg-warm"}`}
                  >
                    {id === "all" ? "All" : STATE_META[id].label} ({count})
                  </button>
                );
              })}
            </div>
            <div className="space-y-5">
              {groups.map(({ group, rows }) => (
                <div key={group}>
                  {groups.length > 1 && <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{group === "program" ? "Degree requirements" : transcript.concentration ?? "Concentration"}</h3>}
                  <ul className="space-y-2">{rows.map((r) => <RequirementRow key={`${r.group}-${r.id}`} requirement={r} />)}</ul>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
