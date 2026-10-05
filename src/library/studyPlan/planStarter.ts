export interface NewestDocument {
  courseId: string;
  resourceId: string;
  name: string;
}

export type PlanStarterChoice =
  | { kind: "enroll" }
  | { kind: "upload"; courseId: string }
  | { kind: "quiz"; courseId: string; resourceId: string; documentName: string };

export function choosePlanStarter(input: {
  classIds: readonly string[];
  newestDocument: NewestDocument | null;
}): PlanStarterChoice {
  if (input.newestDocument) {
    return {
      kind: "quiz",
      courseId: input.newestDocument.courseId,
      resourceId: input.newestDocument.resourceId,
      documentName: input.newestDocument.name,
    };
  }
  if (input.classIds.length === 0) return { kind: "enroll" };
  return { kind: "upload", courseId: input.classIds[0] };
}

export function planStarterHref(choice: PlanStarterChoice): string {
  if (choice.kind === "enroll") return "/classes";
  if (choice.kind === "upload") return `/courses/${choice.courseId}`;
  return `/courses/${choice.courseId}/learning?quizFrom=${encodeURIComponent(choice.resourceId)}`;
}
