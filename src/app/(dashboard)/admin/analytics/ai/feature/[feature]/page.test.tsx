// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdminAccessError } from "@/src/library/adminAuth";

const mocks = vi.hoisted(() => ({ access: vi.fn(), useAiReport: vi.fn() }));
vi.mock("@/src/components/analytics/adminPageAccess", () => ({ adminPageAccess: mocks.access }));
vi.mock("@/src/components/analytics/ai/useAiReport", () => ({ useAiReport: mocks.useAiReport }));
import AiFeaturePage from "./page";

afterEach(cleanup);
beforeEach(() => {
  mocks.access.mockReset().mockResolvedValue(undefined);
  mocks.useAiReport.mockReset().mockReturnValue({ report: null, error: null, loading: true });
});

const open = async (feature: string, query: Record<string, string | string[] | undefined>) =>
  render(await AiFeaturePage({ params: Promise.resolve({ feature }), searchParams: Promise.resolve(query) }));

it("falls back to the slow view when ?view= is missing or unrecognised", async () => {
  for (const query of [{}, { view: "bogus" }, { view: ["", "cost"] }]) {
    await open("quiz-generation", query);
    expect(screen.getByText(/which requests were slow, and was this unusual\?/i), JSON.stringify(query)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "quiz-generation" })).toBeTruthy();
    cleanup();
  }
});

it("opens the view and window the link asked for", async () => {
  await open("chat", { view: "cost", days: "14" });
  expect(screen.getByText(/what is driving the cost\?/i)).toBeTruthy();
  expect(mocks.useAiReport).toHaveBeenCalledWith(14, "chat");
  expect(mocks.access).toHaveBeenCalledWith("/admin/analytics/ai/feature/chat");
});

it("shows the refusal instead of the page for a non-admin", async () => {
  mocks.access.mockResolvedValue(new AdminAccessError(403, "Administrator access is required."));
  await open("chat", { view: "cost" });
  expect(screen.getByRole("heading", { name: "Access denied" })).toBeTruthy();
  expect(mocks.useAiReport).not.toHaveBeenCalled();
});
