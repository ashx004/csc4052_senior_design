"use client";

import { useState } from "react";
import { useAuth } from "@/src/context/AuthContext";
import { MANUAL_GRADE_OPTIONS } from "@/src/library/advisingSchemas";

// "" (no grade) sits first, then the valid grades in order.
const GRADE_STEPS = ["", ...MANUAL_GRADE_OPTIONS];

type TransferCourseRow = {
  courseCode: string;
  courseTitle: string;
  creditHours: string; // kept as string while editing, parsed to number on submit
  grade: string;
};

const EMPTY_ROW: TransferCourseRow = {
  courseCode: "",
  courseTitle: "",
  creditHours: "",
  grade: "",
};

type TransferCreditFormProps = {
  /**
   * Optional context shown to the student — pass through
   * unreadableTransferInfo.rowCount / totalCreditHours from the
   * /api/advising/extract response so they know roughly how many
   * courses to expect.
   */
  expectedRowCount?: number;
  expectedTotalCreditHours?: number;

  /**
   * Called with the save result after a successful submit, so the parent
   * page can clear its "needs review" state or refresh transcript data.
   */
  onSaved?: (result: { addedCount: number; skippedDuplicates: number }) => void;
  onDismiss?: () => void;

  /** Overridable copy so this form works for both the automatic
   * "we couldn't read some transfer rows" case and a student manually
   * adding a completed/prerequisite course at any time. */
  heading?: string;
  description?: string;
  dismissLabel?: string;
};

export default function TransferCreditForm({
  expectedRowCount,
  expectedTotalCreditHours,
  onSaved,
  onDismiss,
  heading = "We couldn't fully read your transfer credit",
  description,
  dismissLabel = "Skip for now",
}: TransferCreditFormProps) {
  const { user } = useAuth();
  const [rows, setRows] = useState<TransferCourseRow[]>([{ ...EMPTY_ROW }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function updateRow(index: number, field: keyof TransferCourseRow, value: string) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  // Moves a row's grade one step through GRADE_STEPS, stopping at either end
  // the way the credits field's arrows stop at its min/max.
  function stepGrade(index: number, direction: 1 | -1) {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const current = Math.max(0, GRADE_STEPS.indexOf(row.grade));
        const next = Math.min(GRADE_STEPS.length - 1, Math.max(0, current + direction));
        return { ...row, grade: GRADE_STEPS[next] };
      })
    );
  }

  function addRow() {
    setRows((prev) => [...prev, { ...EMPTY_ROW }]);
  }

  function removeRow(index: number) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const cleanedRows = rows
      .map((row) => ({
        courseCode: row.courseCode.trim(),
        courseTitle: row.courseTitle.trim() || null,
        creditHours: row.creditHours.trim() === "" ? null : Number(row.creditHours),
        grade: (row.grade || null) as (typeof MANUAL_GRADE_OPTIONS)[number] | null,
      }))
      .filter((row) => row.courseCode !== "");

    if (cleanedRows.length === 0) {
      setError("Enter at least one course code before saving.");
      return;
    }

    const invalidCreditRow = cleanedRows.find(
      (row) => row.creditHours !== null && (!Number.isInteger(row.creditHours) || row.creditHours < 0)
    );

    if (invalidCreditRow) {
      setError(`"${invalidCreditRow.courseCode}" needs a whole number of credit hours (like 1, 2, or 3).`);
      return;
    }

    if (!user) {
      setError("You must be signed in to save transfer credit.");
      return;
    }

    setSubmitting(true);

    try {
      const token = await user.getIdToken();

      const response = await fetch("/api/advising/transfer-credits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ courses: cleanedRows }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? "The transfer credit could not be saved.");
      }

      setSuccessMessage(
        `Saved ${data.addedCount} course${data.addedCount === 1 ? "" : "s"}.` +
          (data.skippedDuplicates > 0
            ? ` (${data.skippedDuplicates} already on file were skipped.)`
            : "")
      );

      onSaved?.({ addedCount: data.addedCount, skippedDuplicates: data.skippedDuplicates });
      setRows([{ ...EMPTY_ROW }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The transfer credit could not be saved.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-border-light bg-bg-warm p-4">
      <h3 className="font-semibold text-text-main">
        {heading}
      </h3>

      <p className="mt-1 text-sm text-text-muted">
        {description ?? (
          <>
            Some transfer courses on your transcript were missing course codes
            or titles in the file we processed
            {typeof expectedRowCount === "number" && expectedRowCount > 0 ? (
              <>
                {" "}
                (approximately {expectedRowCount} course
                {expectedRowCount === 1 ? "" : "s"}
                {typeof expectedTotalCreditHours === "number"
                  ? `, ${expectedTotalCreditHours} credit hours`
                  : ""}
                )
              </>
            ) : null}
            . Please enter them below so they&apos;re counted toward your
            degree progress.
          </>
        )}
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        {rows.map((row, index) => (
          <div
            key={index}
            className="grid grid-cols-1 gap-2 rounded-md border border-border-light bg-bg-container p-3 sm:grid-cols-[1.2fr_2fr_0.8fr_0.6fr_auto]"
          >
            <input
              type="text"
              placeholder="Course code (e.g. ENGL 1013)"
              value={row.courseCode}
              onChange={(e) => updateRow(index, "courseCode", e.target.value)}
              className="w-full min-w-0 rounded border border-border-light bg-bg-main px-2 py-1.5 text-sm text-text-main placeholder:text-text-muted focus:border-border-hover focus:outline-none"
              required
            />

            <input
              type="text"
              placeholder="Course title (optional)"
              value={row.courseTitle}
              onChange={(e) => updateRow(index, "courseTitle", e.target.value)}
              className="w-full min-w-0 rounded border border-border-light bg-bg-main px-2 py-1.5 text-sm text-text-main placeholder:text-text-muted focus:border-border-hover focus:outline-none"
            />

            <input
              type="number"
              min={0}
              max={20}
              step={1}
              placeholder="Credits"
              value={row.creditHours}
              onChange={(e) => updateRow(index, "creditHours", e.target.value)}
              className="w-full min-w-0 rounded border border-border-light bg-bg-main px-2 py-1.5 text-sm text-text-main placeholder:text-text-muted focus:border-border-hover focus:outline-none"
            />

            {/* Read-only so only valid grades can be entered: the arrows
                (or the up/down keys) step through GRADE_STEPS. */}
            <div className="relative">
              <input
                type="text"
                readOnly
                placeholder="Grade"
                value={row.grade}
                aria-label="Grade"
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp") { e.preventDefault(); stepGrade(index, 1); }
                  if (e.key === "ArrowDown") { e.preventDefault(); stepGrade(index, -1); }
                  if (e.key === "Backspace" || e.key === "Delete") { updateRow(index, "grade", ""); }
                }}
                className="w-full min-w-0 cursor-default rounded border border-border-light bg-bg-main py-1.5 pl-2 pr-6 text-sm text-text-main placeholder:text-text-muted focus:border-border-hover focus:outline-none"
              />
              <div className="absolute inset-y-px right-px flex w-5 flex-col overflow-hidden rounded-r border-l border-border-light">
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => stepGrade(index, 1)}
                  disabled={row.grade === GRADE_STEPS[GRADE_STEPS.length - 1]}
                  aria-label="Next grade"
                  className="flex flex-1 items-center justify-center text-[8px] leading-none text-text-muted hover:bg-bg-warm hover:text-text-main disabled:opacity-40"
                >
                  ▲
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => stepGrade(index, -1)}
                  disabled={row.grade === ""}
                  aria-label="Previous grade"
                  className="flex flex-1 items-center justify-center border-t border-border-light text-[8px] leading-none text-text-muted hover:bg-bg-warm hover:text-text-main disabled:opacity-40"
                >
                  ▼
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => removeRow(index)}
              disabled={rows.length === 1}
              className="rounded px-2 py-1.5 text-sm text-alert-error hover:bg-alert-error-bg disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Remove row"
            >
              Remove
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={addRow}
          className="text-sm font-medium text-primary hover:text-primary-hover hover:underline"
        >
          + Add another course
        </button>

        {error ? <p className="text-sm text-alert-error">{error}</p> : null}
        {successMessage ? <p className="text-sm text-alert-success">{successMessage}</p> : null}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-text-inverse hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Saving..." : "Save transfer credit"}
          </button>

          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              className="rounded px-4 py-2 text-sm font-medium text-primary hover:bg-bg-container"
            >
              {dismissLabel}
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}