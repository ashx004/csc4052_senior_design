"use client";

import { classifyMastery } from "@/src/library/studyPlan/masteryEngine";
import type { CourseMastery } from "@/src/library/studyPlan/types";

interface CourseMasterySummaryProps {
  courseName: string;
  summary: CourseMastery | null;
}

export default function CourseMasterySummary({
  courseName,
  summary,
}: CourseMasterySummaryProps) {
  const known = summary != null && summary.knownDocuments > 0 ? summary : null;
  const level = known ? classifyMastery(known.value) : null;
  const totalDocuments = known
    ? Math.max(known.totalDocuments, known.knownDocuments)
    : 0;

  return (
    <section className="rounded-xl bg-white px-5 py-4" aria-label={`${courseName} mastery`}>
      {courseName ? (
        <h3 className="text-sm font-semibold text-navy">{courseName}</h3>
      ) : null}
      {known ? (
        <>
          <p className="mt-1 text-sm font-medium text-navy">
            Mastery {Math.round(known.value)} · based on {known.knownDocuments} of {totalDocuments} documents
          </p>
          <p className="mt-1 text-xs capitalize text-gray-secondary">{level}</p>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm font-medium text-navy">Mastery —</p>
          <p className="mt-1 text-sm text-gray-secondary">
            Complete a quiz to see your mastery.
          </p>
        </>
      )}
    </section>
  );
}
