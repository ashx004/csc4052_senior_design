import { afterEach, beforeEach, expect, it, vi } from "vitest";
const uploadMocks = vi.hoisted(() => ({ track: vi.fn(), addDoc: vi.fn() }));
vi.mock("@/src/library/analytics", () => ({ track: uploadMocks.track }));
vi.mock("../../library/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  addDoc: uploadMocks.addDoc,
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  serverTimestamp: vi.fn(),
  updateDoc: vi.fn(),
  doc: vi.fn(),
  deleteDoc: vi.fn(),
}));
import { uploadUserResource } from "./fileUploadService";
const createTestFile = () =>
  new File(["contents"], "private-name.pdf", { type: "application/pdf" });

beforeEach(() => {
  vi.clearAllMocks();
  uploadMocks.addDoc.mockResolvedValue({ id: "resource" });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("{}", { status: 200 })),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("records storage start and success without private metadata", async () => {
  await uploadUserResource({
    userId: "private-user",
    classDocId: "private-class",
    file: createTestFile(),
    category: "private",
  });
  expect(uploadMocks.track.mock.calls.map((call) => call[0])).toEqual([
    "resource_upload_started",
    "resource_upload_succeeded",
  ]);
  expect(uploadMocks.track.mock.calls[0][1]).toEqual({
    file_type: "pdf",
    entry_point: "resource",
  });
  expect(JSON.stringify(uploadMocks.track.mock.calls)).not.toContain("private");
});

it("reports a storage failure using a safe category", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify({ error: "private error" }), { status: 500 }),
  );
  await expect(
    uploadUserResource({
      userId: "u",
      classDocId: "c",
      file: createTestFile(),
      category: "x",
    }),
  ).rejects.toThrow();
  expect(uploadMocks.track).toHaveBeenLastCalledWith(
    "resource_upload_failed",
    { file_type: "pdf", entry_point: "resource", error_category: "storage" },
    expect.any(String),
  );
  expect(uploadMocks.addDoc).not.toHaveBeenCalled();
});

it("does not relabel successful storage as failed when later metadata fails", async () => {
  uploadMocks.addDoc.mockRejectedValueOnce(new Error("metadata unavailable"));
  await expect(
    uploadUserResource({
      userId: "u",
      classDocId: "c",
      file: createTestFile(),
      category: "x",
    }),
  ).rejects.toThrow();
  expect(uploadMocks.track.mock.calls.map((call) => call[0])).toEqual([
    "resource_upload_started",
    "resource_upload_succeeded",
  ]);
});
