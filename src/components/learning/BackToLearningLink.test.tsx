// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import BackToLearningLink from "./BackToLearningLink";

afterEach(cleanup);

describe("BackToLearningLink", () => {
  it("links back to the learning home", () => {
    render(<BackToLearningLink />);
    const link = screen.getByRole("link", { name: /learning/i });
    expect(link.getAttribute("href")).toBe("/learning");
  });

  it("hides the chevron from assistive technology", () => {
    const { container } = render(<BackToLearningLink />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });
});
