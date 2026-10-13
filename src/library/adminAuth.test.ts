import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const authMock = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("./firebaseAdmin", () => ({ adminAuth: authMock }));
import { requireAdmin } from "./adminAuth";
beforeEach(() => {
  vi.clearAllMocks();
  authMock.verifyIdToken.mockResolvedValue({ uid: "user", admin: true });
  authMock.getUser.mockResolvedValue({ customClaims: { admin: true } });
});

describe("administrator authorization", () => {
  it("rejects unauthenticated requests", async () => {
    await expect(requireAdmin({})).rejects.toMatchObject({ status: 401 });
  });

  it("rejects regular users", async () => {
    authMock.verifyIdToken.mockResolvedValue({ uid: "user" });
    await expect(requireAdmin({ cookie: "token" })).rejects.toMatchObject({
      status: 403,
    });
  });

  it("verifies revocation and current role for admins", async () => {
    await expect(
      requireAdmin({ authorization: "Bearer token" }),
    ).resolves.toEqual({ uid: "user" });
    expect(authMock.verifyIdToken).toHaveBeenCalledWith("token", true);
    expect(authMock.getUser).toHaveBeenCalledWith("user");
  });

  it("denies stale admin claims after role removal", async () => {
    authMock.getUser.mockResolvedValue({ customClaims: {} });
    await expect(requireAdmin({ cookie: "old-token" })).rejects.toMatchObject({
      status: 403,
    });
  });

  it("denies revoked tokens and disabled accounts", async () => {
    authMock.verifyIdToken.mockRejectedValueOnce(new Error("revoked"));
    await expect(requireAdmin({ cookie: "revoked" })).rejects.toMatchObject({
      status: 401,
    });
    authMock.getUser.mockResolvedValue({
      disabled: true,
      customClaims: { admin: true },
    });
    await expect(requireAdmin({ cookie: "token" })).rejects.toMatchObject({
      status: 403,
    });
  });
});
