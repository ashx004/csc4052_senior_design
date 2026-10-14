// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import LearningLandingView from "./LearningLandingView";

vi.mock("@/src/components/studyPlan/WeeklyChickenChart", () => ({
  default: () => null,
}));

afterEach(cleanup);

const baseProps: ComponentProps<typeof LearningLandingView> = {
  pick: null,
  pickLoading: false,
  buddyMessage: "One step at a time.",
  onPickSomethingElse: () => {},
  onBuildPlan: () => {},
  streak: { count: 0, studiedDateKeys: new Set(), week: [] },
  streakLoading: false,
  streakError: null,
  stats: { streakDays: 0, hoursThisWeek: 0, topicsMastered: 0, topicsTotal: 0, dailyProgress: 0 },
  focusRecommendedMinutes: 25,
  hasNextTask: false,
  focusDisabled: false,
  onStartNextTask: () => {},
  onPickTask: () => {},
  userId: null,
  recentSets: null,
};

describe("LearningLandingView", () => {
  it("renders both destinations as links to the real routes", () => {
    render(<LearningLandingView {...baseProps} />);
    expect(
      screen.getByRole("link", { name: /explore your classes/i }).getAttribute("href"),
    ).toBe("/learning/classes");
    expect(
      screen.getByRole("link", { name: /start your study plan/i }).getAttribute("href"),
    ).toBe("/learning/study-plan");
  });

  it("renders the focus mode card and the week stats", () => {
    render(<LearningLandingView {...baseProps} />);
    expect(screen.getByText("Focus mode")).toBeTruthy();
    expect(screen.getByText("Your week at a glance")).toBeTruthy();
    expect(screen.getByText("Current streak")).toBeTruthy();
  });

  it("keeps the focus row flex with a collapsible chart slot when signed out", () => {
    const { container } = render(<LearningLandingView {...baseProps} />);
    const row = container.querySelector("[data-focus-row]");
    expect(row?.className).toContain("lg:flex-row");
    expect(container.querySelector("[data-chart-slot]")?.className).toContain("empty:hidden");
    expect(screen.getByText("Focus mode")).toBeTruthy();
  });

  it("collapses the chart slot to empty when the chart renders null", () => {
    // The mocked chart returns null, so the slot has no child nodes and
    // `:empty` matches; the focus card stays present.
    const { container } = render(<LearningLandingView {...baseProps} userId="u1" />);
    const row = container.querySelector("[data-focus-row]");
    expect(row?.className).toContain("lg:flex-row");
    const slot = container.querySelector("[data-chart-slot]");
    expect(slot?.className).toContain("empty:hidden");
    expect(slot?.childNodes).toHaveLength(0);
    expect(screen.getByText("Focus mode")).toBeTruthy();
  });

  it("renders no hero banner and no surface switcher", () => {
    render(<LearningLandingView {...baseProps} />);
    expect(screen.queryByText(/your next best step is ready/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /explore classes/i })).toBeNull();
  });

  it("omits the jump back in section when recentSets is null", () => {
    render(<LearningLandingView {...baseProps} recentSets={null} />);
    expect(screen.queryByText("Jump back in")).toBeNull();
  });

  it("shows the recent sets under their heading when supplied", () => {
    render(<LearningLandingView {...baseProps} recentSets={<div>recent sets slot</div>} />);
    expect(screen.getByText("Jump back in")).toBeTruthy();
    expect(screen.getByText("recent sets slot")).toBeTruthy();
  });

  it("greets by first name when supplied and plainly when not", () => {
    const { rerender } = render(<LearningLandingView {...baseProps} firstName="Sam" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/^Good (morning|afternoon|evening), Sam$/);
    rerender(<LearningLandingView {...baseProps} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/^Good (morning|afternoon|evening)$/);
  });

  it("renders a plan done count of zero", () => {
    render(<LearningLandingView {...baseProps} planDoneCount={0} planTotalCount={4} />);
    expect(screen.getByText("0 of 4 tasks done")).toBeTruthy();
  });

  it("omits each destination meta line until its counts arrive", () => {
    const { container } = render(<LearningLandingView {...baseProps} />);
    expect(container.querySelectorAll("[data-meta]")).toHaveLength(0);
  });

  it("builds each destination meta line once its counts arrive", () => {
    render(
      <LearningLandingView
        {...baseProps}
        classCount={4}
        classMasteryPercent={61}
        classPips={["330", "350"]}
        planDoneCount={3}
        planTotalCount={4}
        planRemainingMinutes={25}
      />,
    );
    expect(screen.getByText("4 classes · 61% mastered")).toBeTruthy();
    expect(screen.getByText("3 of 4 tasks done · 25 min left")).toBeTruthy();
  });

  it("hides the streak pill when the streak is zero", () => {
    render(<LearningLandingView {...baseProps} />);
    expect(screen.queryByText(/day streak/i)).toBeNull();
  });
});
