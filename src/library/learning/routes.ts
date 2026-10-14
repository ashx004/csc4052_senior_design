export type LearningSurface = "home" | "classes" | "study-plan";

export const LEARNING_ROUTES: Record<LearningSurface, string> = {
  home: "/learning",
  classes: "/learning/classes",
  "study-plan": "/learning/study-plan",
};

export function resolveLearningEntryRoute(
  pathname: string,
  search: URLSearchParams,
): string {
  const query = search.toString();
  if (pathname !== LEARNING_ROUTES.home) return `${pathname}${query ? `?${query}` : ""}`;
  if (!search.has("taskId") && !search.has("suggestionId")) return LEARNING_ROUTES.home;
  return `${LEARNING_ROUTES["study-plan"]}?${query}`;
}
