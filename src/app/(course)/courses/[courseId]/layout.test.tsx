// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CourseUnavailableRecovery from "@/src/components/recovery/CourseUnavailableRecovery";

afterEach(cleanup);

describe("CourseLayout unavailable recovery", () => {
  it("renders the unavailable route variant with contextual, safe destinations", () => {
    const onBackToClasses = vi.fn();
    const onDashboard = vi.fn();
    render(<CourseUnavailableRecovery onBackToClasses={onBackToClasses} onDashboard={onDashboard} />);

    expect(screen.getByRole("heading", { name: "This page isn't available" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back to classes" }));
    fireEvent.click(screen.getByRole("button", { name: "Go to dashboard" }));

    expect(onBackToClasses).toHaveBeenCalledTimes(1);
    expect(onDashboard).toHaveBeenCalledTimes(1);
  });
});
