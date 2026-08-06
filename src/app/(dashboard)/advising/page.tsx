"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, LayoutGrid, List } from "lucide-react";
import { useAuth } from "@/src/context/AuthContext";
import { useSetPageContext } from "@/src/context/AIPageContext";
import { useAdvisingCache } from "@/src/context/AdvisingCacheContext";
import AddEnrollmentModal from "@/src/components/classes/AddEnrollmentModal";

type Term = "Fall" | "Winter" | "Spring" | "Summer";
const TERM_ORDER: Term[] = ["Fall", "Winter", "Spring", "Summer"];

interface AdvisingCourse {
  courseCode: string;
  title: string;
  department: string;
  relevanceReason: "same-department" | "new";
  yearsOfferedThisTerm: number[];
  offeredTerms: Record<Term, { offered: boolean; years: number[] }>;
}

interface AdvisingResponse {
  term: { term: string; year: number };
  termLabel: string;
  generatedAt: string;
  sourceUpdatedAt: string | null;
  recommended: AdvisingCourse[];
  otherLikely: AdvisingCourse[];
  otherLikelyTotal: number;
  page: number;
  pageSize: number;
  departments: string[];
  totalConsidered: number;
  sourceUnavailable?: boolean;
  university?: { name: string; domain: string };
  universityUnsupported?: boolean;
  completedCourses: { classId: string; classCode: string; className: string; term: string; creditHours?: number }[];
  progress: { completedCount: number; totalCreditsCompleted: number };
}

const DEBOUNCE_MS = 350;
const VIEW_STORAGE_KEY = "catalyst:advisingView";
// Skip the auto-revalidate fetch if the cached default view is younger than
// this, so rapid tab-switching doesn't trigger a refetch storm.
const REVALIDATE_SKIP_MS = 60_000;
// Cap how many "other likely" courses ever get spelled out in the AI
// context, independent of how many the student has paged/loaded onto the
// screen — otherwise repeated "Load more" clicks would keep growing the
// text sent with every single chat message.
const MAX_COURSES_IN_SUMMARY = 15;

function faviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

// Kept short and count-based rather than enumerating every course — the
// "other likely offered" list alone can span most of the catalog, and this
// text gets folded into the AI panel's system prompt on every message while
// the student is on this page (src/library/chatContext.ts's PageAIContext).
function buildAdvisingSummary(data: AdvisingResponse, search: string, department: string): string {
  const completedNote = data.completedCourses.length
    ? ` The student has completed ${data.progress.completedCount} course(s)${
        data.progress.totalCreditsCompleted > 0 ? ` (${data.progress.totalCreditsCompleted} credit hours)` : ""
      }: ${data.completedCourses.map((c) => `${c.classCode} (${c.className})`).join(", ")}.`
    : "";

  if (data.universityUnsupported) {
    return (
      `Course offering data isn't available yet for the student's university (${data.university?.name ?? "unknown"}).` +
      completedNote
    );
  }
  if (data.sourceUnavailable) {
    return `Course offering data is temporarily unavailable for ${data.termLabel}.` + completedNote;
  }

  const listCourses = (courses: AdvisingCourse[]) => {
    const shown = courses.slice(0, MAX_COURSES_IN_SUMMARY);
    const suffix = courses.length > shown.length ? `, and ${courses.length - shown.length} more` : "";
    return shown.map((c) => `${c.courseCode} (${c.title})`).join(", ") + suffix;
  };
  const filterNote = [search && `search "${search}"`, department && `department "${department}"`]
    .filter(Boolean)
    .join(", ");

  const parts = [`The student is planning for ${data.termLabel}.`];
  parts.push(
    data.recommended.length
      ? `Recommended courses (likely offered next term, matching the student's existing departments, not yet taken): ${listCourses(data.recommended)}.`
      : "No department-matched recommendations were found."
  );
  parts.push(
    data.otherLikelyTotal > 0
      ? `There are ${data.otherLikelyTotal} other courses likely offered next term across ${data.departments.length} departments (not yet taken) — currently showing a page of ${data.otherLikely.length} of them: ${listCourses(data.otherLikely)}.`
      : "No other likely-offered courses matched the current view."
  );
  if (filterNote) parts.push(`The student currently has a filter applied: ${filterNote}.`);
  return parts.join(" ") + completedNote;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "unknown";
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return "less than an hour ago";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function CourseCard({
  course,
  dense,
  onAdd,
}: {
  course: AdvisingCourse;
  dense?: boolean;
  onAdd?: (course: AdvisingCourse) => void;
}) {
  const offeredTermNames = TERM_ORDER.filter((t) => course.offeredTerms[t]?.offered);

  if (dense) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-bg-container px-4 py-2.5 shadow-sm ring-1 ring-border-light">
        <div className="min-w-0 flex-1">
          <span className="font-semibold text-text-main">{course.courseCode}</span>{" "}
          <span className="text-sm text-text-muted">{course.title}</span>
        </div>
        <span className="shrink-0 text-xs text-text-muted">{offeredTermNames.join(", ") || "—"}</span>
        {onAdd && (
          <button
            type="button"
            onClick={() => onAdd(course)}
            className="shrink-0 rounded-md border border-border-light px-2 py-1 text-xs font-medium text-text-main hover:bg-bg-warm"
          >
            Add
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-bg-container p-5 shadow-sm ring-1 ring-border-light">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-text-main">{course.courseCode}</p>
          <p className="mt-0.5 text-sm text-text-muted">{course.title}</p>
        </div>
        <span className="shrink-0 rounded-full bg-bg-warm px-2.5 py-1 text-xs font-medium text-text-muted">
          {course.department}
        </span>
      </div>
      <p className="mt-3 text-xs text-text-muted">
        Offered in {course.yearsOfferedThisTerm.length ? course.yearsOfferedThisTerm.join(", ") : "recent years"}
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        {TERM_ORDER.map((t) => (
          <span
            key={t}
            className={`rounded-full px-2 py-0.5 text-[11px] ${
              course.offeredTerms[t]?.offered ? "bg-primary/10 text-primary" : "bg-bg-warm text-text-muted/50"
            }`}
          >
            {t}
          </span>
        ))}
      </div>
      {onAdd && (
        <button
          type="button"
          onClick={() => onAdd(course)}
          className="mt-3 w-full rounded-md border border-border-light px-3 py-1.5 text-xs font-medium text-text-main hover:bg-bg-warm"
        >
          Add to my classes
        </button>
      )}
    </div>
  );
}

export default function Advising() {
  const { user } = useAuth();
  const cache = useAdvisingCache<AdvisingResponse, AdvisingCourse>();

  const [data, setData] = useState<AdvisingResponse | null>(() => cache.entry?.data ?? null);
  const [otherLikely, setOtherLikely] = useState<AdvisingCourse[]>(() => cache.entry?.otherLikely ?? []);
  const [loading, setLoading] = useState(() => !cache.entry);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // Skip exactly one auto-revalidate on first mount if the cached default
  // view is still fresh — subsequent search/department/page changes always
  // fetch for real.
  const skipInitialFetch = useRef(Boolean(cache.entry && Date.now() - cache.entry.fetchedAt < REVALIDATE_SKIP_MS));

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState(""); // debounced
  const [department, setDepartment] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [showCompletedCourses, setShowCompletedCourses] = useState(false);

  const [view, setView] = useState<"grid" | "list">("grid");
  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(VIEW_STORAGE_KEY) : null;
    if (stored === "grid" || stored === "list") setView(stored);
  }, []);
  function changeView(next: "grid" | "list") {
    setView(next);
    if (typeof window !== "undefined") window.localStorage.setItem(VIEW_STORAGE_KEY, next);
  }

  const [selectedCourse, setSelectedCourse] = useState<AdvisingCourse | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Debounce the search box so we're not hitting the API on every keystroke.
  useEffect(() => {
    const handle = setTimeout(() => setSearch(searchInput.trim()), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    if (!user) return;

    const isDefaultView = !search && !department;
    if (isDefaultView && skipInitialFetch.current) {
      skipInitialFetch.current = false;
      return; // cached data is fresh enough and already showing — no fetch needed
    }
    skipInitialFetch.current = false;

    let cancelled = false;
    const hadDataAlready = data !== null;
    if (!hadDataAlready) setLoading(true);
    setError(null);

    const params = new URLSearchParams({ page: "1" });
    if (search) params.set("q", search);
    if (department) params.set("department", department);

    fetch(`/api/advising?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return res.json();
      })
      .then((json: AdvisingResponse) => {
        if (cancelled) return;
        setData(json);
        setOtherLikely(json.otherLikely);
        if (isDefaultView) cache.setEntry({ data: json, otherLikely: json.otherLikely, fetchedAt: Date.now() });
      })
      .catch((err) => {
        console.error("Failed to load advising data:", err);
        // A background revalidation failure must not clobber content
        // already on screen — only a genuine no-cache initial load fails.
        if (!cancelled && !hadDataAlready) setError("Couldn't load advising data right now. Please try again later.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, search, department, refreshKey]);

  function loadMore() {
    if (!data || loadingMore) return;
    const nextPage = data.page + 1;
    setLoadingMore(true);

    const params = new URLSearchParams({ page: String(nextPage) });
    if (search) params.set("q", search);
    if (department) params.set("department", department);

    fetch(`/api/advising?${params.toString()}`)
      .then((res) => res.json())
      .then((json: AdvisingResponse) => {
        setData(json);
        setOtherLikely((prev) => [...prev, ...json.otherLikely]);
      })
      .catch((err) => console.error("Failed to load more courses:", err))
      .finally(() => setLoadingMore(false));
  }

  function handleAddCourse(course: AdvisingCourse) {
    setSelectedCourse(course);
    setModalOpen(true);
  }

  function handleEnrollmentAdded() {
    setModalOpen(false);
    setSelectedCourse(null);
    // The course just added should drop out of the recommendation lists,
    // and the default-view cache is now stale.
    cache.clear();
    setRefreshKey((k) => k + 1);
  }

  const hasMore = data ? data.page * data.pageSize < data.otherLikelyTotal : false;

  const summary = useMemo(
    () => (data ? buildAdvisingSummary({ ...data, otherLikely }, search, department) : ""),
    [data, otherLikely, search, department]
  );

  useSetPageContext(
    data
      ? {
          page: "advising",
          label: "Advising",
          summary,
          data: { termLabel: data.termLabel },
        }
      : null,
    [summary]
  );

  const gridClass =
    view === "grid" ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" : "flex flex-col gap-2";

  return (
    <div className="flex h-screen flex-col bg-bg-main text-text-main">
      <header className="relative flex h-[73px] shrink-0 items-center justify-between border-b border-border-light bg-bg-container px-6">
        <h1 className="absolute left-1/2 -translate-x-1/2 text-center text-lg font-semibold tracking-[0.45em] text-text-main">
          Advising.
        </h1>
      </header>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-5xl space-y-8">
          {loading && !data && (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
            </div>
          )}

          {!loading && !data && error && (
            <div className="rounded-2xl bg-bg-container p-6 text-center shadow-sm ring-1 ring-border-light">
              <p className="text-text-main">{error}</p>
            </div>
          )}

          {data && data.progress.completedCount > 0 && (
            <div className="rounded-2xl bg-bg-container p-5 shadow-sm ring-1 ring-border-light">
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <p className="text-2xl font-bold text-text-main">{data.progress.completedCount}</p>
                  <p className="text-xs uppercase tracking-wide text-text-muted">Courses completed</p>
                </div>
                {data.progress.totalCreditsCompleted > 0 && (
                  <div>
                    <p className="text-2xl font-bold text-text-main">{data.progress.totalCreditsCompleted}</p>
                    <p className="text-xs uppercase tracking-wide text-text-muted">Credit hours completed</p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowCompletedCourses((v) => !v)}
                  aria-expanded={showCompletedCourses}
                  className="rounded-md border border-border-light px-3 py-1.5 text-xs font-medium text-text-main hover:bg-bg-warm"
                >
                  {showCompletedCourses ? "Hide completed courses" : "See completed courses"}
                </button>
                <p className="ml-auto text-xs text-text-muted">
                  Credit hours are self-reported when adding a class — no external catalog has this data.
                </p>
              </div>

              {showCompletedCourses && (
                <div className="mt-5 grid grid-cols-1 gap-4 border-t border-border-light pt-5 sm:grid-cols-2 lg:grid-cols-3">
                  {data.completedCourses.map((course) => (
                    <Link
                      key={`${course.classCode}-${course.term}`}
                      href={`/courses/${course.classId}`}
                      className="block rounded-xl bg-bg-warm p-4 transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <p className="font-semibold text-text-main">{course.classCode}</p>
                      <p className="mt-0.5 text-sm text-text-muted">{course.className}</p>
                      <p className="mt-2 text-xs text-text-muted">
                        {course.term}
                        {course.creditHours ? ` · ${course.creditHours} credit hours` : ""}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {data && data.universityUnsupported && (
            <div className="rounded-2xl bg-bg-container p-6 text-center shadow-sm ring-1 ring-border-light">
              {data.university && (
                <img
                  src={faviconUrl(data.university.domain)}
                  alt=""
                  className="mx-auto mb-3 h-8 w-8 rounded"
                />
              )}
              <p className="text-text-main">
                We don&apos;t have detailed course data for {data.university?.name ?? "your university"} yet.
              </p>
              <p className="mt-1 text-sm text-text-muted">
                Advising currently only has real course-offering data for Louisiana Tech University.
              </p>
            </div>
          )}

          {data && !data.universityUnsupported && (
            <>
              <div className="rounded-2xl bg-bg-container p-6 shadow-sm ring-1 ring-border-light">
                <div className="flex items-center gap-3">
                  {data.university && (
                    <img src={faviconUrl(data.university.domain)} alt="" className="h-8 w-8 rounded" />
                  )}
                  <h2 className="text-xl font-bold text-text-main">Planning for {data.termLabel}</h2>
                </div>
                <p className="mt-1 text-sm text-text-muted">
                  {data.sourceUnavailable
                    ? "Course offering data is temporarily unavailable — showing whatever we could find."
                    : `Offering history last updated ${timeAgo(data.sourceUpdatedAt)}.`}
                </p>
                <p className="mt-3 text-xs text-text-muted">
                  This is derived only from public course-offering history and your own added classes — it doesn't
                  account for prerequisites, seat availability, or your full degree plan. Always confirm with your
                  academic advisor before registering.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search by course code or title..."
                  className="flex-1 rounded-md border border-border-light bg-bg-container px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="rounded-md border border-border-light bg-bg-container px-3 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  <option value="">All departments</option>
                  {data.departments.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
                <div className="flex shrink-0 rounded-md border border-border-light bg-bg-container p-1">
                  <button
                    type="button"
                    onClick={() => changeView("grid")}
                    aria-label="Grid view"
                    className={`rounded px-2 py-1 ${view === "grid" ? "bg-bg-warm text-text-main" : "text-text-muted"}`}
                  >
                    <LayoutGrid size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => changeView("list")}
                    aria-label="List view"
                    className={`rounded px-2 py-1 ${view === "list" ? "bg-bg-warm text-text-main" : "text-text-muted"}`}
                  >
                    <List size={16} />
                  </button>
                </div>
              </div>

              {data.recommended.length === 0 && otherLikely.length === 0 ? (
                <div className="rounded-2xl bg-bg-container p-6 text-center shadow-sm ring-1 ring-border-light">
                  <p className="text-text-main">No matching course offerings found for {data.termLabel}.</p>
                </div>
              ) : (
                <>
                  {data.recommended.length > 0 && (
                    <section>
                      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">
                        Recommended for you
                      </h3>
                      <div className={gridClass}>
                        {data.recommended.map((course) => (
                          <CourseCard
                            key={course.courseCode}
                            course={course}
                            dense={view === "list"}
                            onAdd={handleAddCourse}
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  {otherLikely.length > 0 && (
                    <section>
                      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">
                        Other courses likely offered next term ({data.otherLikelyTotal.toLocaleString()})
                      </h3>
                      <div className={gridClass}>
                        {otherLikely.map((course) => (
                          <CourseCard
                            key={course.courseCode}
                            course={course}
                            dense={view === "list"}
                            onAdd={handleAddCourse}
                          />
                        ))}
                      </div>
                      {hasMore && (
                        <div className="mt-4 flex justify-center">
                          <button
                            onClick={loadMore}
                            disabled={loadingMore}
                            className="flex items-center gap-2 rounded-md border border-border-light bg-bg-container px-4 py-2 text-sm font-medium text-text-main hover:bg-bg-warm disabled:opacity-60"
                          >
                            {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                            {loadingMore ? "Loading..." : "Load more"}
                          </button>
                        </div>
                      )}
                    </section>
                  )}
                </>
              )}
            </>
          )}

        </div>
      </div>

      <AddEnrollmentModal
        hideOwnTrigger
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) setSelectedCourse(null);
        }}
        prefill={selectedCourse ? { classCode: selectedCourse.courseCode, className: selectedCourse.title } : undefined}
        onEnrollmentAdded={handleEnrollmentAdded}
      />
    </div>
  );
}
