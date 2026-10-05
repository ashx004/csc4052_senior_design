export function weakConceptReason(input: {
  conceptLabel: string;
  questionIds: readonly string[];
  questionFailureCounts: Record<string, number>;
}): { missedCount: number; repeatedCount: number; reason: string } {
  const missedCount = input.questionIds.length;
  const repeatedCount = input.questionIds.filter(
    (id) => (input.questionFailureCounts[id] ?? 0) >= 2,
  ).length;
  const label = input.conceptLabel.trim() || "this topic";
  const noun = missedCount === 1 ? "question" : "questions";
  const verb = repeatedCount > 0 ? "You keep missing" : "You missed";
  return {
    missedCount,
    repeatedCount,
    reason: `${verb} ${missedCount} ${noun} on ${label}`,
  };
}
