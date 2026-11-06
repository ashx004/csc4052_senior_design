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
    const notPrevented = fireEvent.click(screen.getByRole("link", { name: /learning/i }));
    expect(push).toHaveBeenCalledWith("/courses/bio201/learning");
    // fireEvent returns false once the handler called preventDefault.
    expect(notPrevented).toBe(false);
  });

  it.each([
    ["cmd", { metaKey: true }],
    ["ctrl", { ctrlKey: true }],
    ["shift", { shiftKey: true }],
    ["alt", { altKey: true }],
    ["middle-button", { button: 1 }],
  ])("leaves a %s click to the browser so it can open a new tab", (_label, init) => {
    search.value = new URLSearchParams("from=%2Fcourses%2Fbio201%2Flearning");
    render(<BackToLearningLink />);
    // Read `defaultPrevented` from a document-level listener, which runs after React's root
    // handler, and swallow the default there so jsdom does not try to navigate. A true here
    // means the browser's own new-tab/new-window handling for `href` would still have run.
    let prevented: boolean | null = null;
    const observe = (event: Event) => {
      prevented = event.defaultPrevented;
      event.preventDefault();
    };
    document.addEventListener("click", observe);
    try {
      fireEvent.click(screen.getByRole("link", { name: /learning/i }), init);
    } finally {
      document.removeEventListener("click", observe);
    }
    expect(prevented).toBe(false);
    expect(push).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
  });
});
