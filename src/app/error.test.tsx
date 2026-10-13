// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import RouteError from "./error";
import NotFound from "./not-found";

const { back, push } = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/missing-page",
  useRouter: () => ({ back, push }),
}));

afterEach(cleanup);

beforeEach(() => {
  push.mockReset();
  back.mockReset();
});

describe("application route fallbacks", () => {
  it("renders a recovery screen and retries an unexpected route failure", () => {
    const reset = vi.fn();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(<RouteError error={new Error("request details must stay private")} reset={reset} />);

    expect(screen.getByRole("alert").textContent).toContain("Something went wrong");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Go to dashboard" }));
    expect(push).toHaveBeenCalledWith("/dashboard");
    log.mockRestore();
  });

  it("renders the not-found recovery screen for unmatched routes", () => {
    render(<NotFound />);

    expect(screen.getByRole("heading", { name: "We couldn't find that page" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("The page may have moved");
    fireEvent.click(screen.getByRole("button", { name: "Go to dashboard" }));
    expect(push).toHaveBeenCalledWith("/dashboard");
  });

  it("offers Back only when the previous document is an in-app route", async () => {
    window.history.pushState({}, "", "/learning?view=upcoming");
    Object.defineProperty(document, "referrer", { configurable: true, value: "http://localhost:3000/learning?view=upcoming" });
    render(<NotFound />);

    fireEvent.click(await screen.findByRole("button", { name: "Go back" }));
    expect(back).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Go to dashboard" })).toBeTruthy();
  });
});
