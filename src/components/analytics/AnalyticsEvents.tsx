"use client";
import { useState } from "react";
import type { ReportRow } from "@/src/library/analyticsReportContract";
import { buttonClass, inputClass, panelClass } from "./dashboardUtils";

const eventDetails: Record<
  string,
  { name: string; category: string; description: string }
> = {
  page_view: {
    name: "Page viewed",
    category: "Navigation",
    description:
      "A visit to a normalized page. Personal identifiers and query strings are excluded.",
  },
  quiz_started: {
    name: "Quiz started",
    category: "Quizzes",
    description: "A student starts a quiz or targeted practice.",
  },
  quiz_completed: {
    name: "Quiz completed",
    category: "Quizzes",
    description:
      "A student finishes a quiz. Includes quiz type, question count, and duration.",
  },
  resource_upload_started: {
    name: "Upload started",
    category: "Resources",
    description:
      "A resource or OCR upload begins. File contents and names are excluded.",
  },
  resource_upload_succeeded: {
    name: "Upload succeeded",
    category: "Resources",
    description: "A resource upload completes successfully.",
  },
  resource_upload_failed: {
    name: "Upload failed",
    category: "Resources",
    description: "An upload fails. Only a broad error category is recorded.",
  },
  study_session_started: {
    name: "Study session started",
    category: "Study sessions",
    description: "A student starts a planned study session.",
  },
  study_session_completed: {
    name: "Study session completed",
    category: "Study sessions",
    description: "A study session finishes. Includes task type and duration.",
  },
};

export function AnalyticsEvents({ rows }: { rows: ReportRow[] }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All categories");
  const [expanded, setExpanded] = useState<string | null>(null);
  const filtered = rows.filter((row) => {
    const details = eventDetails[row.label];
    return (
      `${row.label} ${details?.name ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (category === "All categories" || details?.category === category)
    );
  });
  return (
    <section className={panelClass}>
      <h2 className="font-semibold">Explore tracked events</h2>
      <p className="mt-1 text-sm text-text-muted">
        See what each event represents and how often it happened.
      </p>
      <div className="my-5 flex flex-wrap gap-3">
        <input
          aria-label="Search events"
          type="search"
          placeholder="Search events…"
          className={`${inputClass} min-w-0`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          aria-label="Event category"
          className={inputClass}
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          {[
            "All categories",
            "Navigation",
            "Quizzes",
            "Resources",
            "Study sessions",
          ].map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </div>
      {filtered.length === 0 ? (
        <p className="py-6 text-sm text-text-muted">
          {rows.length
            ? "No events match these filters."
            : "No recorded events for this period."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-light text-xs text-text-muted">
                <th className="py-3 font-medium">Event</th>
                <th className="py-3 font-medium">Category</th>
                <th className="py-3 text-right font-medium">Count</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const details = eventDetails[row.label];
                return (
                  <tr
                    key={row.label}
                    className="border-b border-border-light last:border-0"
                  >
                    <td className="py-4 pr-4">
                      <button
                        className={`${buttonClass} border-0 p-0 text-left`}
                        aria-expanded={expanded === row.label}
                        onClick={() =>
                          setExpanded(expanded === row.label ? null : row.label)
                        }
                      >
                        {details?.name ?? row.label} <span aria-hidden>↗</span>
                      </button>
                      <p className="mt-1 break-all text-xs text-text-muted">
                        {row.label}
                      </p>
                      {expanded === row.label && (
                        <p className="mt-3 max-w-md text-sm leading-relaxed text-text-muted">
                          {details?.description ?? "An approved feature event."}
                        </p>
                      )}
                    </td>
                    <td className="pr-4 text-xs text-text-muted">
                      {details?.category ?? "Other"}
                    </td>
                    <td className="text-right font-medium tabular-nums">
                      {row.count.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
