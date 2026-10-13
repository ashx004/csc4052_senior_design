// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import RouteError from "./error";
import NotFound from "./not-found";

afterEach(cleanup);

describe("application route fallbacks", () => {
  it("renders a recovery screen and retries an unexpected route failure", () => {
    const reset = vi.fn();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(<RouteError error={new Error("request details must stay private")} reset={reset} />);

    expect(screen.getByRole("alert").textContent).toContain("Something went wrong");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  it("renders the not-found recovery screen for unmatched routes", () => {
    render(<NotFound />);

    expect(screen.getByRole("heading", { name: "We couldn't find that page" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("The page may have moved");
  });
});
