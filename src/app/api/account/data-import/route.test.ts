import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  class AccountDataImportError extends Error {
    constructor(public status: number, public publicMessage: string) {
      super(publicMessage);
    }
  }
  return {
    AccountDataImportError,
    verifyRequestAuth: vi.fn(),
    checkRateLimit: vi.fn(),
    isAccountDeletionInProgress: vi.fn(),
    parseImportArchive: vi.fn(),
    previewAccountImport: vi.fn(),
    importAccountData: vi.fn(),
  };
});

vi.mock("@/src/library/verifyAuth", () => ({ verifyRequestAuth: mocks.verifyRequestAuth }));
vi.mock("@/src/library/rateLimit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/src/library/accountDeletionGuard", () => ({ isAccountDeletionInProgress: mocks.isAccountDeletionInProgress }));
vi.mock("@/src/library/accountDataImport", () => ({
  AccountDataImportError: mocks.AccountDataImportError,
  importByteLimit: () => 1000,
  parseImportArchive: mocks.parseImportArchive,
  previewAccountImport: mocks.previewAccountImport,
  importAccountData: mocks.importAccountData,
}));

import { POST } from "./route";

function request(fields: Record<string, string | Blob>, headers: Record<string, string> = {}) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  return new NextRequest("http://localhost/api/account/data-import", { method: "POST", body, headers });
}

const zip = () => new Blob(["zip bytes"], { type: "application/zip" });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyRequestAuth.mockResolvedValue({ uid: "signed-in" });
  mocks.checkRateLimit.mockReturnValue({ allowed: true });
  mocks.isAccountDeletionInProgress.mockResolvedValue(false);
  mocks.parseImportArchive.mockResolvedValue({ sourceUid: "someone" });
  mocks.previewAccountImport.mockResolvedValue({ classes: [] });
  mocks.importAccountData.mockResolvedValue({ classes: [], queuedJobs: 0 });
});

describe("POST /api/account/data-import", () => {
  it("rejects a signed-out request before reading the upload", async () => {
    mocks.verifyRequestAuth.mockResolvedValue(null);
    const response = await POST(request({ file: zip(), mode: "preview" }));
    expect(response.status).toBe(401);
    expect(mocks.parseImportArchive).not.toHaveBeenCalled();
  });

  it("previews without importing", async () => {
    const response = await POST(request({ file: zip(), mode: "preview" }));
    expect(response.status).toBe(200);
    expect(mocks.previewAccountImport).toHaveBeenCalledWith("signed-in", { sourceUid: "someone" });
    expect(mocks.importAccountData).not.toHaveBeenCalled();
  });

  it("imports into the signed-in account with the student's choices", async () => {
    const response = await POST(request({ file: zip(), mode: "import", decisions: JSON.stringify({ c1: "merge" }) }));
    expect(response.status).toBe(200);
    expect(mocks.importAccountData).toHaveBeenCalledWith("signed-in", { sourceUid: "someone" }, { c1: "merge" });
  });

  it("rejects unknown choices", async () => {
    const response = await POST(request({ file: zip(), mode: "import", decisions: JSON.stringify({ c1: "overwrite" }) }));
    expect(response.status).toBe(400);
    expect(mocks.importAccountData).not.toHaveBeenCalled();
  });

  it("rejects a missing file or mode", async () => {
    expect((await POST(request({ mode: "preview" }))).status).toBe(400);
    expect((await POST(request({ file: zip(), mode: "delete" }))).status).toBe(400);
  });

  it("rejects an oversized upload from its declared size", async () => {
    const response = await POST(request({ file: zip(), mode: "preview" }, { "content-length": String(5 * 1024 * 1024) }));
    expect(response.status).toBe(413);
    expect(mocks.parseImportArchive).not.toHaveBeenCalled();
  });

  it("is rate limited", async () => {
    mocks.checkRateLimit.mockReturnValue({ allowed: false, retryAfterSeconds: 60 });
    expect((await POST(request({ file: zip(), mode: "preview" }))).status).toBe(429);
  });

  it("refuses while the account is being deleted", async () => {
    mocks.isAccountDeletionInProgress.mockResolvedValue(true);
    expect((await POST(request({ file: zip(), mode: "import" }))).status).toBe(410);
    expect(mocks.importAccountData).not.toHaveBeenCalled();
  });

  it("returns the archive check's message for a bad file", async () => {
    mocks.parseImportArchive.mockRejectedValue(new mocks.AccountDataImportError(400, "This file is damaged."));
    const response = await POST(request({ file: zip(), mode: "preview" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "This file is damaged." });
  });
});
