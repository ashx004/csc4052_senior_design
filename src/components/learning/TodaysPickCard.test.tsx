// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import TodaysPickCard from "./TodaysPickCard";
import type { TodaysPick } from "@/src/library/learning/todaysPick";

afterEach(cleanup);

const pick: TodaysPick = {
  kind: "recommended",
  title: "Grammar and parsing",
  context: "Programming Languages",
  href: "/courses/c1/learning?taskId=t1",
  lessonCount: 2,
  remainingMinutes: 15,
  percent: 30,
};

describe("TodaysPickCard", () => {
  it("names the pick and links the play action to it", () => {
    render(<TodaysPickCard pick={pick} buddyMessage="Three days to go." />);
    expect(screen.getByText("Today's pick: Grammar and parsing")).toBeTruthy();
    const action = screen.getByRole("link", {
      name: /start today's pick: grammar and parsing/i,
    });
    expect(action.getAttribute("href")).toBe("/courses/c1/learning?taskId=t1");
  });

  it("shows the buddy message with the mascot marked decorative", () => {
    const { container } = render(
      <TodaysPickCard pick={pick} buddyMessage="Three days to go." />,
    );
    expect(screen.getByText("Your study buddy")).toBeTruthy();
    expect(screen.getByText("Three days to go.")).toBeTruthy();
    const img = container.querySelector("img");
    expect(img?.getAttribute("alt")).toBe("");
  });

  it("shows lessons, minutes and the percentage when all are present", () => {
    render(<TodaysPickCard pick={pick} buddyMessage="x" />);
    expect(screen.getByText("2 lessons")).toBeTruthy();
    expect(screen.getByText("15 min")).toBeTruthy();
    expect(screen.getByText("30%")).toBeTruthy();
  });

  it("draws an empty ring at 0 percent and a full ring at 100", () => {
    const circumference = 2 * Math.PI * 32;
    const offsetAt = (percent: number) => {
      const { container } = render(
        <TodaysPickCard pick={{ ...pick, percent }} buddyMessage="x" />,
      );
      const circles = container.querySelectorAll("[data-progress-ring] circle");
      const offset = Number(circles[1].getAttribute("stroke-dashoffset"));
      cleanup();
      return offset;
    };
    const zero = render(
      <TodaysPickCard pick={{ ...pick, percent: 0 }} buddyMessage="x" />,
    );
    expect(screen.getByText("0%")).toBeTruthy();
    zero.unmount();
    expect(offsetAt(0)).toBeCloseTo(circumference);
    expect(offsetAt(100)).toBe(0);
  });

  it("omits the percentage and the ring when the pick has no progress", () => {
    const noPercent: TodaysPick = {
      kind: pick.kind,
      title: pick.title,
      context: pick.context,
      href: pick.href,
      lessonCount: pick.lessonCount,
      remainingMinutes: pick.remainingMinutes,
    };
    const { container } = render(
      <TodaysPickCard pick={noPercent} buddyMessage="x" />,
    );
    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.queryByText(/NaN/)).toBeNull();
    expect(container.querySelector("[data-progress-ring]")).toBeNull();
  });

  it("omits the duration when the pick has no remaining minutes", () => {
    const noMinutes: TodaysPick = {
      kind: pick.kind,
      title: pick.title,
      context: pick.context,
      href: pick.href,
      lessonCount: pick.lessonCount,
      percent: pick.percent,
    };
    render(<TodaysPickCard pick={noMinutes} buddyMessage="x" />);
    expect(screen.queryByText(/min/)).toBeNull();
    expect(screen.queryByText("0 min")).toBeNull();
  });

  it("offers to build a plan when there is nothing queued", () => {
    const onBuildPlan = vi.fn();
    render(
      <TodaysPickCard pick={null} buddyMessage="x" onBuildPlan={onBuildPlan} />,
    );
    expect(screen.getByText("Nothing queued yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Build today's plan" }));
    expect(onBuildPlan).toHaveBeenCalledTimes(1);
  });

  it("renders a skeleton without the pick while loading", () => {
    const { container } = render(<TodaysPickCard pick={null} buddyMessage="x" loading />);
    expect(screen.getByRole("status").textContent).toMatch(/loading/i);
    const labelId = container.querySelector("section")?.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    expect(container.querySelector(`#${labelId}`)?.textContent).toMatch(/loading/i);
    expect(screen.queryByText("Nothing queued yet")).toBeNull();
  });
});
