import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  verifyRequestAuth: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  get: vi.fn(),
}));

vi.mock("@/src/library/verifyAuth", () => ({ verifyRequestAuth: mocks.verifyRequestAuth }));
vi.mock("@/src/library/firebaseAdmin", () => ({ adminDb: { collection: mocks.collection } }));

import { GET } from "./route";

function request() {
  return new NextRequest("http://localhost/api/document-jobs/ocr-1");
}

describe("GET /api/document-jobs/[jobId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.collection.mockReturnValue({ doc: mocks.doc });
    mocks.doc.mockReturnValue({ get: mocks.get });
    mocks.verifyRequestAuth.mockResolvedValue({ uid: "student-1" });
  });

  it("requires an authenticated student", async () => {
    mocks.verifyRequestAuth.mockResolvedValue(null);

    expect((await GET(request(), { params: Promise.resolve({ jobId: "ocr-1" }) })).status).toBe(401);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("returns canonical OCR status and known progress for the job owner", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      id: "ocr-1",
      data: () => ({ userId: "student-1", status: "complete", lastError: null }),
    });

    const response = await GET(request(), { params: Promise.resolve({ jobId: "ocr-1" }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      job: { id: "ocr-1", type: "ocr", status: "completed", progress: 100 },
      status: "complete",
      lastError: null,
    });
  });

  it("does not disclose another student's job", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      id: "ocr-1",
      data: () => ({ userId: "another-student", status: "processing" }),
    });

    const response = await GET(request(), { params: Promise.resolve({ jobId: "ocr-1" }) });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Job not found" });
  });
});
