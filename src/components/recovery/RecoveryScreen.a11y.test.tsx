// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import RecoveryScreen from "./RecoveryScreen";

afterEach(cleanup);

describe("RecoveryScreen accessibility", () => {
  it("gives the recovery region a labelled heading and exposes keyboard-focusable actions", () => {
    const retry = vi.fn();
    const dashboard = vi.fn();
    render(
      <RecoveryScreen
        variant="server"
        primaryAction={{ label: "Try again", onClick: retry }}
        secondaryAction={{ label: "Go to dashboard", onClick: dashboard }}
      />
    );

    const heading = screen.getByRole("heading", { name: "Catalyst couldn't complete that request" });
    const region = heading.closest("section");
    const retryButton = screen.getByRole("button", { name: "Try again" });
    const dashboardButton = screen.getByRole("button", { name: "Go to dashboard" });

    expect(region?.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(screen.getByRole("alert").textContent).toContain("Please try again in a moment.");
    retryButton.focus();
    expect(document.activeElement).toBe(retryButton);
    expect(retryButton.className).toContain("focus-visible:outline");

    fireEvent.click(retryButton);
    fireEvent.click(dashboardButton);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(dashboard).toHaveBeenCalledTimes(1);
  });
});
