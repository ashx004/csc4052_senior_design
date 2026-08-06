"use client";

interface QuizResultsProps {
  score: number;
  total: number;
}

export default function QuizResults({ score, total }: QuizResultsProps) {
  const percentage = total > 0 ? Math.round((score / total) * 100) : 0;

  return (
    <div className="rounded-2xl border border-border-light bg-bg-container p-6 text-center shadow-sm">
      <p className="text-2xl font-bold text-[#1a1a2e]">
        {score} out of {total} correct
      </p>
      <p className="mt-1 text-sm text-text-muted">{percentage}% score</p>
    </div>
  );
}
