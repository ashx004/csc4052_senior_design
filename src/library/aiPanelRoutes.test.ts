import { describe, expect, it } from "vitest";
import { pageHasOwnAiPanel } from "./aiPanelRoutes";

describe("pageHasOwnAiPanel", () => {
  it("is true where a page brings its own contextual panel", () => {
    for (const path of ["/ai-assistant", "/courses/c1", "/courses/c1/", "/courses/c1/learning", "/courses/c1/quizzes/q1", "/courses/c1/flashcards/s1"]) {
      expect(pageHasOwnAiPanel(path), path).toBe(true);
    }
  });

  it("is false everywhere else so the global panel shows", () => {
    for (const path of ["/dashboard", "/notes", "/calendar", "/courses/c1/notes", "/courses/c1/discover", "/courses/c1/discover/blocks", "/courses/c1/discover/p9", "/courses/c1/quizzes", "/courses/c1/flashcards", "/courses/c1/practice", "/courses/c1/practice/s1", "/courses/c1/assignments", "/courses/c1/due-dates", "/courses/c1/summaries"]) {
      expect(pageHasOwnAiPanel(path), path).toBe(false);
    }
    expect(pageHasOwnAiPanel(null)).toBe(false);
  });
});
