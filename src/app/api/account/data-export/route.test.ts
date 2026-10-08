import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  ...(() => {
    class AccountDataExportError extends Error {
      constructor(public status: number, public publicMessage: string) {
        super(publicMessage);
      }
    }
    return {
      verifyRequestAuth: vi.fn(),
      buildAccountDataExport: vi.fn(),
      AccountDataExportError,
    };
  })(),
}));

vi.mock("@/src/library/verifyAuth", () => ({
  verifyRequestAuth: mocks.verifyRequestAuth,
}));

vi.mock("@/src/library/accountDataExport", () => ({
  buildAccountDataExport: mocks.buildAccountDataExport,
  AccountDataExportError: mocks.AccountDataExportError,
}));

import { GET } from "./route";

describe("GET /api/account/data-export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an unauthenticated request before compiling an archive", async () => {
    mocks.verifyRequestAuth.mockResolvedValue(null);

    const response = await GET(new NextRequest("http://localhost/api/account/data-export"));

    expect(response.status).toBe(401);
    expect(mocks.buildAccountDataExport).not.toHaveBeenCalled();
  });

  it("downloads a ZIP compiled only for the verified token subject", async () => {
    mocks.verifyRequestAuth.mockResolvedValue({ uid: "verified-user" });
    mocks.buildAccountDataExport.mockResolvedValue(Buffer.from("zip-bytes"));

    const response = await GET(new NextRequest("http://localhost/api/account/data-export?uid=other-user"));

    expect(mocks.buildAccountDataExport).toHaveBeenCalledWith("verified-user");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Disposition")).toContain("attachment;");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("zip-bytes");
  });

  it("returns a safe service category when an export dependency is unavailable", async () => {
    mocks.verifyRequestAuth.mockResolvedValue({ uid: "verified-user" });
    mocks.buildAccountDataExport.mockRejectedValue(new mocks.AccountDataExportError(
      503,
      "Catalyst indexed context (Qdrant) is unavailable. Please try again later."
    ));

    const response = await GET(new NextRequest("http://localhost/api/account/data-export"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Catalyst indexed context (Qdrant) is unavailable. Please try again later.",
    });
  });
});
