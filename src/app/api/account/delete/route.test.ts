import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  class AccountDeletionError extends Error {
    constructor(public publicMessage: string) {
      super(publicMessage);
    }
  }
  return {
    getIdToken: vi.fn(),
    verifyIdToken: vi.fn(),
    deleteAccountData: vi.fn(),
    AccountDeletionError,
  };
});

vi.mock("@/src/library/firestoreRest", () => ({ getIdToken: mocks.getIdToken }));
vi.mock("@/src/library/firebaseAdmin", () => ({ adminAuth: { verifyIdToken: mocks.verifyIdToken } }));
vi.mock("@/src/library/accountDeletion", () => ({
  deleteAccountData: mocks.deleteAccountData,
  AccountDeletionError: mocks.AccountDeletionError,
}));

import { POST } from "./route";
import { ACCOUNT_DELETION_CONFIRMATION } from "@/src/library/accountDeletionConsent";

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/account/delete", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/account/delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-08T21:00:00.000Z"));
    mocks.getIdToken.mockReturnValue("token");
  });

  afterEach(() => vi.useRealTimers());

  it("requires a token before inspecting the deletion request", async () => {
    mocks.getIdToken.mockReturnValue(null);
    const response = await POST(request({ confirmation: ACCOUNT_DELETION_CONFIRMATION, acknowledged: true }));
    expect(response.status).toBe(401);
    expect(mocks.verifyIdToken).not.toHaveBeenCalled();
  });

  it("requires explicit consent before deleting anything", async () => {
    const response = await POST(request({ confirmation: "DELETE", acknowledged: false }));
    expect(response.status).toBe(400);
    expect(mocks.verifyIdToken).not.toHaveBeenCalled();
    expect(mocks.deleteAccountData).not.toHaveBeenCalled();
  });

  it("uses only the recently authenticated token subject", async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: "verified-user", auth_time: Math.floor(Date.now() / 1000) - 30 });
    mocks.deleteAccountData.mockResolvedValue(undefined);

    const response = await POST(request({
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
      acknowledged: true,
      uid: "another-user",
    }));

    expect(response.status).toBe(200);
    expect(mocks.deleteAccountData).toHaveBeenCalledWith("verified-user");
    await expect(response.json()).resolves.toEqual({ deleted: true });
  });

  it("rejects a session that was not recently authenticated", async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: "verified-user", auth_time: Math.floor(Date.now() / 1000) - 601 });
    const response = await POST(request({ confirmation: ACCOUNT_DELETION_CONFIRMATION, acknowledged: true }));
    expect(response.status).toBe(401);
    expect(mocks.deleteAccountData).not.toHaveBeenCalled();
  });

  it("keeps a partial purge private while returning its safe recovery message", async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: "verified-user", auth_time: Math.floor(Date.now() / 1000) });
    mocks.deleteAccountData.mockRejectedValue(new mocks.AccountDeletionError("Deletion is protected and can be retried."));
    const response = await POST(request({ confirmation: ACCOUNT_DELETION_CONFIRMATION, acknowledged: true }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Deletion is protected and can be retried." });
  });
});
