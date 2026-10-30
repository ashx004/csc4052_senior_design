// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { cookieGet, redirect, requireAdmin } = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  // Next's redirect never returns; it throws to unwind the render.
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT ${url}`); }),
  requireAdmin: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookieGet }) }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/src/library/adminAuth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/library/adminAuth")>()),
  requireAdmin,
}));

import { AdminAccessError } from "@/src/library/adminAuth";
import { SESSION_COOKIE } from "@/src/library/requestAuthToken";
import { AdminAccessDenied } from "./AdminAccessDenied";
import { adminPageAccess } from "./adminPageAccess";

beforeEach(() => {
  cookieGet.mockImplementation((name: string) => (name === SESSION_COOKIE ? { value: "session-cookie" } : undefined));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("adminPageAccess", () => {
  it("lets an admin through, checking the session cookie", async () => {
    requireAdmin.mockResolvedValue(undefined);
    await expect(adminPageAccess("/admin/analytics")).resolves.toBeUndefined();
    expect(requireAdmin).toHaveBeenCalledWith({ cookie: "session-cookie" });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("sends a signed-out visitor to sign in and back to the page, and the redirect is not swallowed", async () => {
    requireAdmin.mockRejectedValue(new AdminAccessError(401, "Sign in to continue."));
    await expect(adminPageAccess("/admin/analytics/ai/details")).rejects.toThrow("NEXT_REDIRECT /login?redirect=/admin/analytics/ai/details");
    expect(redirect).toHaveBeenCalledWith("/login?redirect=/admin/analytics/ai/details");
  });

  it("returns a refusal as it was raised", async () => {
    const refused = new AdminAccessError(403, "Administrator access required.");
    requireAdmin.mockRejectedValue(refused);
    await expect(adminPageAccess("/admin/analytics/ai")).resolves.toBe(refused);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("turns any other failure into a 503, without its message", async () => {
    requireAdmin.mockRejectedValue(new Error("firebase exploded"));
    const error = await adminPageAccess("/admin/analytics");
    expect(error).toBeInstanceOf(AdminAccessError);
    expect(error).toMatchObject({ status: 503, message: "Administrator verification is unavailable." });
  });
});

describe("AdminAccessDenied", () => {
  it("titles a 403 Access denied and shows its message", () => {
    render(<AdminAccessDenied error={new AdminAccessError(403, "Administrator access required.")} unavailableTitle="Analytics unavailable" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Access denied");
    expect(screen.getByText("Administrator access required.")).toBeTruthy();
  });

  it("uses the page's own title when access could not be checked", () => {
    render(<AdminAccessDenied error={new AdminAccessError(503, "Administrator verification is unavailable.")} unavailableTitle="AI performance unavailable" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("AI performance unavailable");
    expect(screen.getByText("Administrator verification is unavailable.")).toBeTruthy();
  });
});
