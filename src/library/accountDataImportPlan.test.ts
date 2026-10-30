import { describe, expect, it } from "vitest";
import { findConflict, makeRewriter, planClassImport, sourceSnapshot, type ExportedDocument } from "./accountDataImportPlan";

const leaf = (id: string, fields: Record<string, unknown>, subcollections: Record<string, ExportedDocument[]> = {}): ExportedDocument => ({
  id, fields, subcollections,
});

function ids() {
  let n = 0;
  return () => `NewId${String(++n).padStart(15, "0")}`;
}

describe("findConflict", () => {
  const existing = [{ id: "a", classCode: "CSC 4052", className: "Senior Design", term: "Fall 2026" }];

  it("matches the same course code written differently", () => {
    expect(findConflict({ classCode: "csc-4052", term: "Fall 2026" }, existing)?.id).toBe("a");
  });

  it("treats a different term as a different class", () => {
    expect(findConflict({ classCode: "CSC 4052", term: "Spring 2027" }, existing)).toBeUndefined();
  });

  it("matches on code alone when either side has no term", () => {
    expect(findConflict({ classCode: "CSC4052" }, existing)?.id).toBe("a");
  });

  it("never matches a class with no code", () => {
    expect(findConflict({ className: "Senior Design" }, existing)).toBeUndefined();
  });
});

describe("makeRewriter", () => {
  it("replaces ids inside keys and encoded URLs, longest first", () => {
    const rewrite = makeRewriter(new Map([["abc", "X"], ["abcdef", "Y"], ["uid1", "uid2"]]));
    expect(rewrite("users/uid1/classes/abcdef/abc.pdf")).toBe("users/uid2/classes/Y/X.pdf");
    expect(rewrite(`/api/download?key=${encodeURIComponent("users/uid1/x")}`)).toBe("/api/download?key=users%2Fuid2%2Fx");
  });
});

describe("planClassImport", () => {
  const cls = leaf("CourseIdAAAAAAAAAAAA", { classCode: "CSC 4052", className: "Senior Design" }, {
    resources: [
      leaf("ResourceAAAAAAAAAAAA", { name: "a.pdf", fileType: "pdf" }, {
        chunks: [
          leaf("chunk_0", { text: "ok", embedding: [1, 2], chunkIndex: 0 }),
          leaf("chunk_1", { text: "edited", embedding: ["not", "numbers"], chunkIndex: 1 }),
        ],
      }),
      leaf("ResourceBBBBBBBBBBBB", { name: "photo.png", fileType: "png" }),
      leaf("ResourceCCCCCCCCCCCC", { name: "skip.pdf", fileType: "pdf", indexSkipped: true }),
    ],
  });
  const base = { cls, oldUid: "old", newUid: "new", files: [] };

  it("keeps chunk document names but gives everything else a new id", () => {
    const plan = planClassImport({ ...base, decision: "import", conflict: undefined, newId: ids() });
    expect(plan.writes.map((w) => w.path)).toEqual([
      "users/new/enrollment/NewId000000000000001",
      "users/new/enrollment/NewId000000000000001/resources/NewId000000000000002",
      "users/new/enrollment/NewId000000000000001/resources/NewId000000000000002/chunks/chunk_0",
      "users/new/enrollment/NewId000000000000001/resources/NewId000000000000002/chunks/chunk_1",
      "users/new/enrollment/NewId000000000000001/resources/NewId000000000000003",
      "users/new/enrollment/NewId000000000000001/resources/NewId000000000000004",
    ]);
  });

  it("only restores valid vectors, and only queues documents the worker can read", () => {
    const plan = planClassImport({ ...base, decision: "import", conflict: undefined, newId: ids() });
    const [pdf, png, skipped] = plan.resources;
    expect(pdf.chunks).toEqual([{ chunkIndex: 0, text: "ok", embedding: [1, 2] }]);
    expect(png.needsIndexJob).toBe(false);
    expect(skipped.needsIndexJob).toBe(false);
  });

  it("merges into the existing class without rewriting its details", () => {
    const plan = planClassImport({ ...base, decision: "merge", conflict: { id: "Existing", className: "My SD" }, newId: ids() });
    expect(plan).toMatchObject({ action: "merged", courseId: "Existing", className: "My SD" });
    expect(plan.writes.some((w) => w.path === "users/new/enrollment/Existing")).toBe(false);
  });

  it("names a copy so it's distinguishable from the original", () => {
    const plan = planClassImport({ ...base, decision: "copy", conflict: { id: "Existing" }, newId: ids() });
    expect(plan.action).toBe("copied");
    expect(plan.writes[0].data.className).toBe("Senior Design (imported)");
  });

  it("only brings files that belong to the old account", () => {
    const files = [
      { archivePath: "files/objects/a--1.pdf", objectKey: "users/old/classes/CourseIdAAAAAAAAAAAA/a.pdf", contentType: null, bytes: 1, sha256: "" },
      { archivePath: "files/objects/b--2.pdf", objectKey: "users/someoneElse/classes/CourseIdAAAAAAAAAAAA/b.pdf", contentType: null, bytes: 1, sha256: "" },
    ];
    const plan = planClassImport({ ...base, files, decision: "import", conflict: undefined, newId: ids() });
    expect(plan.files).toEqual([{ archivePath: "files/objects/a--1.pdf", toKey: "users/new/classes/NewId000000000000001/a.pdf", contentType: null }]);
  });
});

describe("sourceSnapshot", () => {
  it("matches the identity the document worker computes", () => {
    const a = sourceSnapshot({ url: "/u", name: "n", fileType: "pdf" });
    expect(a.version).toMatch(/^[0-9a-f]{64}$/);
    expect(sourceSnapshot({ url: "/u", name: "n", fileType: "pdf" }).version).toBe(a.version);
    expect(sourceSnapshot({ url: "/u", name: "n", fileType: "pdf", ocrSourceVersion: "v1" }).version).toBe("v1");
  });
});
