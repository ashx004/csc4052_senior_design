// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import RouteError from "./error";
import NotFound from "./not-found";

const { back, push, reportClientError } = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn(), reportClientError: vi.fn() }));

vi.mock("@/src/library/monitoring/reportClientError", () => ({ reportClientError }));

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

  it("reports the route failure to error tracking", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = Object.assign(new Error("render failed"), { digest: "abc123" });

    render(<RouteError error={error} reset={vi.fn()} />);

    expect(reportClientError).toHaveBeenCalledWith(error, { digest: "abc123" });
    log.mockRestore();
  });

  it("restores normal route content when a retry succeeds", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    function RetryHarness() {
      const [failed, setFailed] = useState(true);
      return failed ? <RouteError error={new Error("first route attempt failed")} reset={() => setFailed(false)} /> : <p>Course content restored</p>;
    }

    render(<RetryHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("Course content restored")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
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
