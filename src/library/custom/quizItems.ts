// Pure helpers for taking a custom quiz: grouping questions the way the class
// quiz page does (a matching group is shown together) and scoring.

export interface CustomQuizQuestion {
  id: string;
  type: "multiple_choice" | "true_false" | "matching";
  question: string;
  options: string[];
  correctAnswer: string;
  matchingGroupId?: string;
  explanation?: string;
}

export type QuizRenderItem =
  | { kind: "standard"; question: CustomQuizQuestion }
  | { kind: "matching"; groupId: string; questions: CustomQuizQuestion[] };

/** One card per standard question; matching questions sharing a group id become one block, placed where the group first appears. */
export function groupQuizQuestions(questions: CustomQuizQuestion[]): QuizRenderItem[] {
  const items: QuizRenderItem[] = [];
  const groupAt = new Map<string, number>();
  for (const question of questions) {
    if (question.type === "matching" && question.matchingGroupId) {
      const at = groupAt.get(question.matchingGroupId);
      if (at === undefined) {
        groupAt.set(question.matchingGroupId, items.length);
        items.push({ kind: "matching", groupId: question.matchingGroupId, questions: [question] });
      } else {
        const item = items[at];
        if (item.kind === "matching") item.questions.push(question);
      }
    } else if (question.type !== "matching") {
      items.push({ kind: "standard", question });
    }
  }
  return items;
}

/** Questions the student can actually answer (a matching question with no group can't be shown). */
export function answerableQuestions(questions: CustomQuizQuestion[]): CustomQuizQuestion[] {
  const shown = new Set(
    groupQuizQuestions(questions).flatMap((item) => (item.kind === "standard" ? [item.question.id] : item.questions.map((q) => q.id)))
  );
  return questions.filter((q) => shown.has(q.id));
}

export function scoreQuiz(questions: CustomQuizQuestion[], answers: Record<string, string>): { score: number; total: number; percent: number } {
  const total = questions.length;
  const score = questions.filter((q) => answers[q.id] === q.correctAnswer).length;
  return { score, total, percent: total > 0 ? Math.round((score / total) * 100) : 0 };
}
