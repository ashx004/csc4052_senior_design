import { beforeEach, describe, expect, it, vi } from "vitest";

const doc = vi.fn();
const collection = vi.fn();

vi.mock("@/src/library/firebaseAdmin", () => ({
  adminDb: {
    doc: (path: string) => doc(path),
    collection: (path: string) => collection(path),
  },
}));

function withResources(docs: Array<{ id: string }>) {
  collection.mockReturnValue({
    where: () => ({ limit: () => ({ get: async () => ({ docs }) }) }),
  });
}
vi.mock("@/src/library/ollamaEmbeddings", () => ({ embedTexts: vi.fn() }));
vi.mock("@/src/library/vectorStore", () => ({ searchChunks: vi.fn() }));
vi.mock("@/src/library/documentTextCache", () => ({ getDocumentText: vi.fn() }));

import type { NextRequest } from "next/server";
import { courseIdFromBody, resolveDepsFor } from "./resolveDeps";

const request = {} as NextRequest;

function withStatus(data: unknown) {
  doc.mockReturnValue({ get: async () => ({ data: () => data }) });
}

describe("resolveDepsFor().indexStatusOf", () => {
  beforeEach(() => {
    doc.mockReset();
  });

  it("reads the resource under the course enrollment path", async () => {
    withStatus({ indexStatus: "complete" });
    const deps = resolveDepsFor(request, "u1", "c1");

    expect(await deps.indexStatusOf("r1")).toBe("complete");
    expect(doc).toHaveBeenCalledWith("users/u1/enrollment/c1/resources/r1");
  });

  it("reports nothing without a courseId, so the raw-text path is used", async () => {
    const deps = resolveDepsFor(request, "u1", undefined);

    expect(await deps.indexStatusOf("r1")).toBeUndefined();
    expect(doc).not.toHaveBeenCalled();
  });

  it("reports nothing for an unrecognized status", async () => {
    withStatus({ indexStatus: "halfway" });
    expect(await resolveDepsFor(request, "u1", "c1").indexStatusOf("r1")).toBeUndefined();
  });

  it("reports nothing for a missing document", async () => {
    withStatus(undefined);
    expect(await resolveDepsFor(request, "u1", "c1").indexStatusOf("r1")).toBeUndefined();
  });

  // An unknown index state must never fail a generation — it only means
  // "fall back to reading the file".
  it("swallows a Firestore failure", async () => {
    doc.mockReturnValue({
      get: async () => {
        throw new Error("Firestore unavailable");
      },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await resolveDepsFor(request, "u1", "c1").indexStatusOf("r1")).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("courseIdFromBody", () => {
  it("reads a string courseId", () => {
    expect(courseIdFromBody({ courseId: "c1" })).toBe("c1");
  });

  it.each([{}, null, { courseId: "" }, { courseId: 7 }])("reports nothing for %s", (body) => {
    expect(courseIdFromBody(body)).toBeUndefined();
  });
});

describe("resolveDepsFor().resourceIdForUrl", () => {
  beforeEach(() => {
    doc.mockReset();
    collection.mockReset();
  });

  it("finds the resource whose url matches, so a legacy request can use retrieval", async () => {
    withResources([{ id: "r1" }]);
    const deps = resolveDepsFor(request, "u1", "c1");

    expect(await deps.resourceIdForUrl!("/api/download?key=users%2Fu1%2Fa.pdf")).toBe("r1");
    expect(collection).toHaveBeenCalledWith("users/u1/enrollment/c1/resources");
  });

  it("reports nothing without a courseId", async () => {
    const deps = resolveDepsFor(request, "u1", undefined);
    expect(await deps.resourceIdForUrl!("/api/download?key=users%2Fu1%2Fa.pdf")).toBeNull();
    expect(collection).not.toHaveBeenCalled();
  });

  it("reports nothing when no resource matches", async () => {
    withResources([]);
    const deps = resolveDepsFor(request, "u1", "c1");
    expect(await deps.resourceIdForUrl!("/api/download?key=users%2Fu1%2Fa.pdf")).toBeNull();
  });

  it("swallows a Firestore failure so the raw-text path still runs", async () => {
    collection.mockReturnValue({
      where: () => ({ limit: () => ({ get: async () => { throw new Error("Firestore unavailable"); } }) }),
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const deps = resolveDepsFor(request, "u1", "c1");

    expect(await deps.resourceIdForUrl!("/api/download?key=users%2Fu1%2Fa.pdf")).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
