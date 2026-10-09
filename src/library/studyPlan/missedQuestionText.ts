export function missedQuestionTexts(
  questionIds: readonly string[],
  quizQuestions: readonly { id: string; question: string }[],
): string[] {
  const byId = new Map(quizQuestions.map((q) => [q.id, q.question]));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of questionIds) {
    const text = byId.get(id);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}
