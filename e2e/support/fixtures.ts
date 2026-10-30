import { readFileSync } from "node:fs";

export type E2eFixtures = {
  courseId: string;
  quizId: string;
  flashcardSetId: string;
  practiceSetId: string;
  publicSetId: string;
  noteId: string;
  shareId: string;
  customSetId: string;
};

let cached: E2eFixtures | undefined;

const localFixtures: E2eFixtures = {
  courseId: "e2e-course",
  quizId: "e2e-quiz",
  flashcardSetId: "e2e-flashcards",
  practiceSetId: "e2e-practice",
  publicSetId: "e2e-public-set",
  noteId: "e2e-note",
  shareId: "e2e-share",
  customSetId: "e2e-custom-set",
};

export function fixtures(): E2eFixtures {
  if (cached) return cached;
  if (process.env.E2E_LOCAL === "true") {
    cached = localFixtures;
    return cached;
  }
  const path = process.env.E2E_FIXTURE_MANIFEST;
  if (!path) throw new Error("E2E_FIXTURE_MANIFEST is required.");
  const parsed = JSON.parse(readFileSync(path, "utf8")) as {
    student?: Partial<E2eFixtures>;
  };
  const student = parsed.student;
  const names: (keyof E2eFixtures)[] = [
    "courseId",
    "quizId",
    "flashcardSetId",
    "practiceSetId",
    "publicSetId",
    "noteId",
    "shareId",
    "customSetId",
  ];
  if (!student || names.some((name) => !student[name]?.trim())) {
    throw new Error("E2E fixture manifest is missing a required student route ID.");
  }
  cached = student as E2eFixtures;
  return cached;
}
