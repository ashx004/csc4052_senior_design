"use client";

import { useState } from "react";

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
};

export default function TransferCreditForm({
  expectedRowCount,
  expectedTotalCreditHours,
  onSaved,
  onDismiss,
}: TransferCreditFormProps) {
  const [rows, setRows] = useState<TransferCourseRow[]>([{ ...EMPTY_ROW }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function updateRow(index: number, field: keyof TransferCourseRow, value: string) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
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
        grade: row.grade.trim() || null,
      }))
      .filter((row) => row.courseCode !== "");

    if (cleanedRows.length === 0) {
      setError("Enter at least one course code before saving.");
      return;
    }

    const invalidCreditRow = cleanedRows.find(
      (row) => row.creditHours !== null && (Number.isNaN(row.creditHours) || row.creditHours < 0)
    );

    if (invalidCreditRow) {
      setError(`"${invalidCreditRow.courseCode}" has an invalid credit hours value.`);
      return;
    }

    setSubmitting(true);

    try {
      // Session auth is a cookie set on this same origin, so the browser
      // attaches it automatically — no manual Authorization header needed.
      const response = await fetch("/api/advising/transfer-credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <h3 className="font-semibold text-amber-900">
        We couldn&apos;t fully read your transfer credit
      </h3>

      <p className="mt-1 text-sm text-amber-800">
        Some transfer courses on your transcript were missing course codes or
        titles in the file we processed
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
        . Please enter them below so they&apos;re counted toward your degree
        progress.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        {rows.map((row, index) => (
          <div
            key={index}
            className="grid grid-cols-1 gap-2 rounded-md border border-amber-200 bg-white p-3 sm:grid-cols-[1.2fr_2fr_0.8fr_0.6fr_auto]"
          >
            <input
              type="text"
              placeholder="Course code (e.g. ENGL 1013)"
              value={row.courseCode}
              onChange={(e) => updateRow(index, "courseCode", e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm"
              required
            />

            <input
              type="text"
              placeholder="Course title (optional)"
              value={row.courseTitle}
              onChange={(e) => updateRow(index, "courseTitle", e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm"
            />

            <input
              type="number"
              min={0}
              max={20}
              step={0.5}
              placeholder="Credits"
              value={row.creditHours}
              onChange={(e) => updateRow(index, "creditHours", e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm"
            />

            <input
              type="text"
              placeholder="Grade"
              value={row.grade}
              onChange={(e) => updateRow(index, "grade", e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm"
              maxLength={3}
            />

            <button
              type="button"
              onClick={() => removeRow(index)}
              disabled={rows.length === 1}
              className="rounded px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Remove row"
            >
              Remove
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={addRow}
          className="text-sm font-medium text-amber-800 hover:underline"
        >
          + Add another course
        </button>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {successMessage ? <p className="text-sm text-green-700">{successMessage}</p> : null}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Saving..." : "Save transfer credit"}
          </button>

          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              className="rounded px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
            >
              Skip for now
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
