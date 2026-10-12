import { describe, expect, it, vi } from "vitest";
import { dedupeSources, ownsUrl, resolveSources, MAX_SOURCES } from "./resolveSources";
import type { SourceInput } from "./sourceTypes";

const UID = "user1";
const own = (name: string) => `/api/download?key=users%2F${UID}%2F${name}`;
const doc = (title: string, name = title, resourceId = title) => ({
  title,
  url: own(name),
  fileType: "pdf",
  resourceId,
});

const deps = (over: Partial<Parameters<typeof resolveSources>[0]> = {}) => ({
  uid: UID,
  readText: vi.fn(async () => "raw extracted text"),
  indexStatusOf: vi.fn(async () => "complete" as const),
  embed: vi.fn(async () => [[1, 0]]),
  search: vi.fn(async () => [
    { score: 0.9, payload: { text: "ctx", rawText: "chunk one", page: 2, resourceId: "r", chunkIndex: 0, userId: UID, courseId: "c" } },
  ]),
  ...over,
});

describe("ownsUrl", () => {
  it("accepts both the encoded and unencoded own-user prefixes", () => {
    expect(ownsUrl(`/api/download?key=users%2F${UID}%2Fa.pdf`, UID)).toBe(true);
    expect(ownsUrl(`/api/download?key=users/${UID}/a.pdf`, UID)).toBe(true);
  });

  it("rejects another user's key and anything else", () => {
    expect(ownsUrl("/api/download?key=users%2Fother%2Fa.pdf", UID)).toBe(false);
    expect(ownsUrl("https://evil.example/a.pdf", UID)).toBe(false);
    expect(ownsUrl("", UID)).toBe(false);
  });
});

describe("dedupeSources", () => {
  // Review Focus 5: a lecture and its document-note share a url.
  it("keeps one entry when a document and its note share a url", () => {
    const list: SourceInput[] = [
      { title: "Lecture 3", url: own("l3.pdf"), fileType: "pdf" },
      { title: "My notes on Lecture 3", url: own("l3.pdf"), fileType: "PDF" },
    ];
    expect(dedupeSources(list)).toHaveLength(1);
  });

  it("de-duplicates regardless of fileType case or title", () => {
    const list: SourceInput[] = [
      { title: "A", url: own("x.pdf"), fileType: "pdf" },
      { title: "B", url: own("x.pdf"), fileType: "PdF" },
    ];
    expect(dedupeSources(list)).toHaveLength(1);
  });

  it("treats the encoded and unencoded forms of one key as the same source", () => {
    const list: SourceInput[] = [
      { title: "A", url: `/api/download?key=users%2F${UID}%2Fx.pdf`, fileType: "pdf" },
      { title: "B", url: `/api/download?key=users/${UID}/x.pdf`, fileType: "pdf" },
    ];
    expect(dedupeSources(list)).toHaveLength(1);
  });

  it("keeps distinct documents and every typed note", () => {
    const list: SourceInput[] = [
      { title: "A", url: own("a.pdf"), fileType: "pdf" },
      { title: "B", url: own("b.pdf"), fileType: "pdf" },
      { title: "N1", text: "one" },
      { title: "N2", text: "two" },
    ];
    expect(dedupeSources(list)).toHaveLength(4);
  });
});

describe("resolveSources", () => {
  it("uses retrieval and reports it when the document is indexed", async () => {
    const d = deps();
    const result = await resolveSources(d, [doc("Lecture 1")]);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].viaRetrieval).toBe(true);
    expect(result.sources[0].text).toContain("chunk one");
    expect(result.sources[0].pages).toEqual([2]);
    expect(d.readText).not.toHaveBeenCalled();
  });

  it("generates from rawText rather than the contextualized text", async () => {
    const result = await resolveSources(deps(), [doc("Lecture 1")]);
    expect(result.sources[0].text).toContain("chunk one");
    expect(result.sources[0].text).not.toContain("ctx");
  });

  it("uses the contextualized text when a chunk has no rawText", async () => {
    const search = vi.fn(async () => [
      { score: 0.9, payload: { text: "only ctx", page: 1, resourceId: "r", chunkIndex: 0, userId: UID, courseId: "c" } },
    ]);
    const result = await resolveSources(deps({ search }), [doc("Lecture 1")]);
    expect(result.sources[0].text).toContain("only ctx");
  });

  it.each(["queued", "processing", "failed"] as const)("falls back to raw text when indexStatus is %s", async (status) => {
    const d = deps({ indexStatusOf: vi.fn(async () => status) });
    const result = await resolveSources(d, [doc("Lecture 1")]);
    expect(result.sources[0].viaRetrieval).toBe(false);
    expect(result.sources[0].text).toBe("raw extracted text");
    expect(d.readText).toHaveBeenCalled();
  });

  it("falls back to raw text when retrieval returns nothing", async () => {
    const d = deps({ search: vi.fn(async () => []) });
    const result = await resolveSources(d, [doc("Lecture 1")]);
    expect(result.sources[0].viaRetrieval).toBe(false);
    expect(result.sources[0].text).toBe("raw extracted text");
  });

  it("passes a typed note's text straight through", async () => {
    const result = await resolveSources(deps(), [{ title: "My note", text: "note body" }]);
    expect(result.sources[0]).toMatchObject({ text: "note body", resourceId: null, sourceKey: null, viaRetrieval: false });
  });

  it("skips another user's document without failing the request", async () => {
    const result = await resolveSources(deps(), [
      { title: "Theirs", url: "/api/download?key=users%2Fother%2Fx.pdf", fileType: "pdf" },
      doc("Mine"),
    ]);
    expect(result.sources.map((s) => s.title)).toEqual(["Mine"]);
    expect(result.skipped).toEqual([{ title: "Theirs", reason: "not-owned" }]);
  });

  // Review Focus 2: a source with no usable text is skipped, not silently empty.
  it("skips a source whose text is blank", async () => {
    const d = deps({ indexStatusOf: vi.fn(async () => "failed" as const), readText: vi.fn(async () => "   ") });
    const result = await resolveSources(d, [doc("Empty")]);
    expect(result.sources).toHaveLength(0);
    expect(result.skipped).toEqual([{ title: "Empty", reason: "no-text" }]);
  });

  it("skips a note whose text is blank", async () => {
    const result = await resolveSources(deps(), [{ title: "Blank note", text: "  \n " }]);
    expect(result.sources).toHaveLength(0);
    expect(result.skipped[0].reason).toBe("no-text");
  });

  it("skips a document it cannot read instead of throwing", async () => {
    const d = deps({
      indexStatusOf: vi.fn(async () => "failed" as const),
      readText: vi.fn(async () => {
        throw new Error("unreadable");
      }),
    });
    const result = await resolveSources(d, [doc("Broken")]);
    expect(result.sources).toHaveLength(0);
    expect(result.skipped[0].reason).toBe("unreadable");
  });

  it("returns nothing for an empty selection", async () => {
    expect(await resolveSources(deps(), [])).toEqual({ sources: [], skipped: [] });
  });

  it("refuses more than the source cap", async () => {
    const many = Array.from({ length: MAX_SOURCES + 1 }, (_, i) => doc(`L${i}`, `l${i}.pdf`, `r${i}`));
    await expect(resolveSources(deps(), many)).rejects.toThrow("at most 10");
  });

  it("keeps each source's text inside the per-source budget", async () => {
    const d = deps({ indexStatusOf: vi.fn(async () => "failed" as const), readText: vi.fn(async () => "x".repeat(200_000)) });
    const result = await resolveSources(d, [doc("Huge")]);
    expect(result.sources[0].text.length).toBeLessThanOrEqual(48_000);
  });

  it("records the storage key for set identity", async () => {
    const result = await resolveSources(deps(), [doc("Lecture 1", "l1.pdf")]);
    expect(result.sources[0].sourceKey).toBe(`users/${UID}/l1.pdf`);
  });

  it("asks retrieval for vectors so diversity selection can work", async () => {
    const search = vi.fn(async () => [
      { score: 0.9, payload: { text: "ctx", rawText: "chunk one", page: 1, resourceId: "r", chunkIndex: 0, userId: UID, courseId: "c" }, vector: [1, 0] },
    ]);
    await resolveSources(deps({ search }), [doc("Lecture 1")]);
    // Fourth argument carries the opt-in; without it every candidate is
    // vectorless and selectChunks silently falls back to score order.
    expect((search.mock.calls[0] as unknown[])[3]).toEqual({ withVectors: true });
  });

  it("passes chunk vectors through to selection", async () => {
    // Two near-identical vectors plus one distinct: diversity must prefer the
    // distinct chunk over the near-duplicate despite its lower score.
    const search = vi.fn(async () => [
      { score: 0.90, payload: { text: "c", rawText: "alpha text here", page: 1, resourceId: "r", chunkIndex: 0, userId: UID, courseId: "c" }, vector: [1, 0] },
      { score: 0.89, payload: { text: "c", rawText: "near duplicate!", page: 2, resourceId: "r", chunkIndex: 1, userId: UID, courseId: "c" }, vector: [1, 0] },
      { score: 0.50, payload: { text: "c", rawText: "distinct topic!", page: 3, resourceId: "r", chunkIndex: 2, userId: UID, courseId: "c" }, vector: [0, 1] },
    ]);
    // Budget fits exactly two of the three 15-char chunks.
    const result = await resolveSources(deps({ search }), [doc("Lecture 1")], 32);
    expect(result.sources[0].text).toContain("alpha text here");
    expect(result.sources[0].text).toContain("distinct topic!");
    expect(result.sources[0].text).not.toContain("near duplicate!");
  });

  it("does not throw on a malformed percent-encoded own-prefix url", async () => {
    const bad = { title: "Odd name", url: `/api/download?key=users%2F${UID}%2F%E0%A4%A`, fileType: "pdf" };
    const d = deps({ indexStatusOf: vi.fn(async () => "failed" as const) });
    const result = await resolveSources(d, [bad]);
    // Resolved without a storage key, or skipped with a reason: never a throw.
    expect(result.sources.length + result.skipped.length).toBe(1);
    if (result.sources.length) expect(result.sources[0].sourceKey).toBeNull();
  });

  it("still resolves the good source when another one is malformed", async () => {
    const bad = { title: "Odd name", url: `/api/download?key=users%2F${UID}%2F%E0%A4%A`, fileType: "pdf" };
    const result = await resolveSources(deps(), [bad, doc("Good")]);
    expect(result.sources.map((s) => s.title)).toContain("Good");
    expect(result.sources.length + result.skipped.length).toBe(2);
  });
});
