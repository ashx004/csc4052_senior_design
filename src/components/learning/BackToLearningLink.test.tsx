// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import BackToLearningLink from "./BackToLearningLink";

const { back, push, search } = vi.hoisted(() => ({
  back: vi.fn(),
  push: vi.fn(),
  search: { value: new URLSearchParams() },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/learning/study-plan",
  useRouter: () => ({ back, push }),
  useSearchParams: () => search.value,
}));

afterEach(cleanup);

beforeEach(() => {
  back.mockReset();
  push.mockReset();
  search.value = new URLSearchParams();
});

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

  it("points at a safe return path when the URL carries one", () => {
    search.value = new URLSearchParams("from=%2Fcourses%2Fbio201%2Flearning");
    render(<BackToLearningLink />);
    expect(screen.getByRole("link", { name: /learning/i }).getAttribute("href")).toBe(
      "/courses/bio201/learning",
    );
  });

  it("navigates through the hook rather than letting the link do it", () => {
    search.value = new URLSearchParams("from=%2Fcourses%2Fbio201%2Flearning");
    render(<BackToLearningLink />);
    fireEvent.click(screen.getByRole("link", { name: /learning/i }));
    expect(push).toHaveBeenCalledWith("/courses/bio201/learning");
  });
});
