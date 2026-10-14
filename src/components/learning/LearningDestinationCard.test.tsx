// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import LearningDestinationCard from "./LearningDestinationCard";

afterEach(cleanup);

const base = {
  href: "/learning/classes",
  icon: <svg data-testid="icon" />,
  title: "Explore your classes",
  surfaceClassName: "bg-card-lav",
  scribbleClassName: "text-scrib-lav",
  notchClassName: "shadow-[0_0_0_9px_var(--color-beige-canvas)]",
  pipBorderClassName: "border-card-lav",
};

describe("LearningDestinationCard", () => {
  it("is a single link named by its title", () => {
    render(<LearningDestinationCard {...base} meta="4 classes" pips={["330", "350"]} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("/learning/classes");
    expect(links[0].textContent).toContain("Explore your classes");
  });

  it("renders the meta line and pips when they are given", () => {
    render(<LearningDestinationCard {...base} meta="4 classes · 61% mastered" pips={["330", "350"]} />);
    expect(screen.getByText("4 classes · 61% mastered")).toBeTruthy();
    expect(screen.getByText("330")).toBeTruthy();
    expect(screen.getByText("350")).toBeTruthy();
  });

  it("keeps course codes on separate labels and folds the rest into a count", () => {
    render(
      <LearningDestinationCard
        {...base}
        meta="5 classes"
        pips={["CSC 325", "CSC 499", "CSC 330", "CSC 401"]}
      />,
    );
    for (const code of ["CSC 325", "CSC 499", "CSC 330"]) {
      const pip = screen.getByText(code);
      expect(pip.className).not.toContain("-ml-");
      expect(pip.className).toContain("truncate");
    }
    expect(screen.queryByText("CSC 401")).toBeNull();
    expect(screen.getByText("+1")).toBeTruthy();
  });

  it("borders each pip in the card's own colour", () => {
    render(<LearningDestinationCard {...base} meta="x" pips={["330", "350"]} />);
    for (const code of ["330", "350"]) {
      const pip = screen.getByText(code);
      expect(pip.className).toContain("border-card-lav");
      expect(pip.className).not.toContain("inherit");
    }
  });

  it("omits the meta line entirely when counts have not loaded", () => {
    const { container } = render(<LearningDestinationCard {...base} />);
    expect(container.querySelector("[data-meta]")).toBeNull();
    expect(screen.queryByText(/0 classes/)).toBeNull();
    expect(screen.queryByText(/0%/)).toBeNull();
  });

  it("keeps the meta line when meta is an empty string", () => {
    const { container } = render(<LearningDestinationCard {...base} meta="" />);
    expect(container.querySelector("[data-meta]")).not.toBeNull();
  });

  it("hides the scribble and the arrow from assistive technology", () => {
    const { container } = render(<LearningDestinationCard {...base} />);
    const scribble = container.querySelector("[data-scribble]");
    expect(scribble?.getAttribute("aria-hidden")).toBe("true");
    const arrow = container.querySelector("[data-arrow]");
    expect(arrow?.getAttribute("aria-hidden")).toBe("true");
  });
});
