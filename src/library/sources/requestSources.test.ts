import { describe, expect, it } from "vitest";
import { countFromBody, sourcesFromBody } from "./requestSources";

describe("sourcesFromBody", () => {
  it("reads a sources array", () => {
    const out = sourcesFromBody({ sources: [{ title: "A", url: "/api/download?key=x", fileType: "pdf" }] });
    expect(out).toHaveLength(1);
  });

  it("accepts the legacy docUrl shape as one source", () => {
    const out = sourcesFromBody({ docUrl: "/api/download?key=x", docName: "Lecture.pdf" });
    expect(out).toEqual([{ title: "Lecture.pdf", url: "/api/download?key=x", fileType: "pdf" }]);
  });

  it("derives the file type from the document name", () => {
    expect(sourcesFromBody({ docUrl: "/u", docName: "notes.DOCX" })[0]).toMatchObject({ fileType: "docx" });
  });

  it("defaults the file type to pdf when the name has no extension", () => {
    expect(sourcesFromBody({ docUrl: "/u", docName: "scan" })[0]).toMatchObject({ fileType: "pdf" });
  });

  it("prefers sources over docUrl when both are present", () => {
    const out = sourcesFromBody({
      sources: [{ title: "A", text: "body" }],
      docUrl: "/api/download?key=x",
      docName: "Ignored.pdf",
    });
    expect(out).toEqual([{ title: "A", text: "body" }]);
  });

  it("returns nothing for a body with neither shape", () => {
    expect(sourcesFromBody({})).toEqual([]);
    expect(sourcesFromBody(null)).toEqual([]);
  });

  it("drops entries that are not a source shape at all", () => {
    const out = sourcesFromBody({ sources: [{ title: "ok", text: "t" }, { noTitle: true }, 42, null] });
    expect(out).toEqual([{ title: "ok", text: "t" }]);
  });

  // A note the student can see in their notebook must never disappear
  // silently: with nothing to read it becomes empty text, which resolveSources
  // then reports in `skipped`.
  it("keeps a titled entry with nothing to read so it can be reported as skipped", () => {
    expect(sourcesFromBody({ sources: [{ title: "bad" }] })).toEqual([{ title: "bad", text: "" }]);
  });

  // Note.fileType is optional, so a document note can arrive without one.
  it("completes a missing fileType from the title instead of dropping the note", () => {
    expect(sourcesFromBody({ sources: [{ title: "Week 3.pptx", url: "/u" }] })).toEqual([
      { title: "Week 3.pptx", url: "/u", fileType: "pptx" },
    ]);
    expect(sourcesFromBody({ sources: [{ title: "Scan", url: "/u" }] })).toEqual([
      { title: "Scan", url: "/u", fileType: "pdf" },
    ]);
  });

  it("keeps a passed resourceId so retrieval can be used", () => {
    const out = sourcesFromBody({ sources: [{ title: "A", url: "/u", fileType: "pdf", resourceId: "r1" }] });
    expect(out[0]).toMatchObject({ resourceId: "r1" });
  });
});

describe("countFromBody", () => {
  it("uses the requested count when it is in range", () => {
    expect(countFromBody({ count: 25 }, 30, 20)).toBe(25);
  });

  it("falls back when the count is missing", () => {
    expect(countFromBody({}, 30, 20)).toBe(20);
  });

  it.each([0, -1, 31, 2.5, "ten", null])("rejects an invalid count %s", (count) => {
    expect(() => countFromBody({ count }, 30, 20)).toThrow("between 1 and 30");
  });

  it("accepts the boundaries", () => {
    expect(countFromBody({ count: 1 }, 30, 20)).toBe(1);
    expect(countFromBody({ count: 30 }, 30, 20)).toBe(30);
  });
});
