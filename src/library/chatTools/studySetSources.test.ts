import { describe, expect, it } from "vitest";
import { capSources, hasAnySource, noteRowToSource, requestedSourcesFromArgs } from "./studySetSources";
import { MAX_SOURCES } from "@/src/library/sources/resolveSources";
import { completeKeys, notebookSetFields, plainSetFields } from "@/src/library/studySets/notebookSet";

describe("requestedSourcesFromArgs", () => {
  it("still accepts the old single documentName", () => {
    expect(requestedSourcesFromArgs({ courseId: "c", documentName: "Lecture 1.pdf" })).toEqual({
      documentNames: ["Lecture 1.pdf"],
      noteTitles: [],
      notebook: null,
    });
  });

  it("merges documentName with documentNames and drops case-insensitive repeats", () => {
    const got = requestedSourcesFromArgs({ documentName: "A.pdf", documentNames: ["a.PDF", "B.pdf", "  "], noteTitles: ["Graphs", "graphs"] });
    expect(got.documentNames).toEqual(["A.pdf", "B.pdf"]);
    expect(got.noteTitles).toEqual(["Graphs"]);
  });

  it("reads a notebook name and ignores non-strings", () => {
    expect(requestedSourcesFromArgs({ notebook: " Algorithms ", documentNames: [1, null] })).toMatchObject({ documentNames: [], notebook: "Algorithms" });
  });

  it("reports whether anything was asked for", () => {
    expect(hasAnySource(requestedSourcesFromArgs({ courseId: "c" }))).toBe(false);
    expect(hasAnySource(requestedSourcesFromArgs({ notebook: "N" }))).toBe(true);
  });
});

describe("noteRowToSource", () => {
  it("uses a typed note's plain text", () => {
    expect(noteRowToSource({ id: "n1", data: { kind: "typed", title: "Graphs", plainText: " BFS and DFS " } })).toMatchObject({ title: "Graphs", text: "BFS and DFS", noteId: "n1", typed: true });
  });

  it("falls back to the note's content when plainText is missing", () => {
    const content = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Dijkstra" }] }] };
    expect(noteRowToSource({ id: "n2", data: { kind: "typed", title: "T", content } })).toMatchObject({ text: expect.stringContaining("Dijkstra") });
  });

  it("points a document note at its file and resource", () => {
    expect(noteRowToSource({ id: "n3", data: { kind: "document", title: "Slides", url: "/api/download?key=users%2Fu%2Fa.pdf", fileType: "pdf", resourceId: "r1" } })).toMatchObject({
      url: "/api/download?key=users%2Fu%2Fa.pdf",
      fileType: "pdf",
      resourceId: "r1",
      typed: false,
    });
  });

  it("keeps an empty typed note as empty text so it is reported, not dropped", () => {
    expect(noteRowToSource({ id: "n4", data: { kind: "typed", title: "Blank" } })).toMatchObject({ text: "", typed: true });
  });
});

describe("capSources", () => {
  it("keeps a set's worth and reports the rest", () => {
    const many = Array.from({ length: MAX_SOURCES + 3 }, (_, i) => ({ title: `n${i}`, text: "x" }));
    const { kept, overflow } = capSources(many);
    expect(kept).toHaveLength(MAX_SOURCES);
    expect(overflow.map((s) => s.title)).toEqual(["n10", "n11", "n12"]);
  });
});

describe("study set identity", () => {
  it("marks a notebook set but keeps its real files discoverable", () => {
    expect(notebookSetFields("nb1", ["users/u/a.pdf"])).toEqual({ sourceDocKey: "notebook:nb1", sourceNotebookId: "nb1", sourceKeys: ["users/u/a.pdf"] });
  });

  it("uses the smallest real key as the primary key", () => {
    expect(plainSetFields(["users/u/b.pdf", "users/u/a.pdf", "note:n1"]).sourceDocKey).toBe("users/u/a.pdf");
    expect(plainSetFields([]).sourceDocKey).toBeNull();
  });

  it("adds synthetic keys for typed notes, and for documents only when nothing resolved to a key", () => {
    expect(completeKeys(["users/u/a.pdf"], ["n1"], ["r1"])).toEqual(["users/u/a.pdf", "note:n1"]);
    expect(completeKeys([], ["n1"], ["r1"])).toEqual(["note:n1", "resource:r1"]);
  });
});
