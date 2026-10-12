import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chunkPointId, deleteChunksForResource, deleteChunksForUser, ensurePayloadIndexes, resetPayloadIndexCheck, upsertChunks } from "./vectorStore";

const UUID_V5_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("chunkPointId", () => {
  it("is deterministic for the same resourceId + chunkIndex", () => {
    expect(chunkPointId("resourceA", 0)).toBe(chunkPointId("resourceA", 0));
  });

  it("differs across chunk indices of the same resource", () => {
    expect(chunkPointId("resourceA", 0)).not.toBe(chunkPointId("resourceA", 1));
  });

  it("differs across resources at the same chunk index", () => {
    expect(chunkPointId("resourceA", 0)).not.toBe(chunkPointId("resourceB", 0));
  });

  it("produces a well-formed UUIDv5 (version/variant nibbles set)", () => {
    expect(chunkPointId("resourceA", 0)).toMatch(UUID_V5_RE);
  });
});

const ok = () => new Response(JSON.stringify({ result: true, status: "ok" }));
const calls = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.map(([url, init]) => ({ url: String(url), method: init?.method, body: init?.body ? JSON.parse(init.body) : undefined }));

beforeEach(() => {
  vi.stubEnv("QDRANT_URL", "http://qdrant.test:6333");
  vi.stubEnv("QDRANT_FALLBACK_URL", "");
  resetPayloadIndexCheck();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Qdrant payload indexes", () => {
  it("creates keyword indexes on userId and resourceId, once, before the first write", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => ok());
    vi.stubGlobal("fetch", fetchMock);

    await upsertChunks([{ id: "a", vector: [0.1], payload: { userId: "u", courseId: "c", resourceId: "r", chunkIndex: 0, text: "t" } }]);
    await deleteChunksForResource("u", "r");

    const sent = calls(fetchMock);
    const indexCalls = sent.filter((c) => c.url.includes("/index"));
    expect(indexCalls.map((c) => c.body)).toEqual([
      { field_name: "userId", field_schema: "keyword" },
      { field_name: "resourceId", field_schema: "keyword" },
    ]);
    expect(indexCalls.every((c) => c.method === "PUT")).toBe(true);
    // Indexes come first, and are not re-created for the second call.
    expect(sent[0].url).toContain("/index");
    expect(sent.filter((c) => c.url.includes("/points")).length).toBe(2);
  });

  it("never blocks the real call if creating an index fails, and tries again next time", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn().mockImplementation(async (url: string) => (String(url).includes("/index") ? new Response("nope", { status: 500 }) : ok()));
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteChunksForResource("u", "r")).resolves.toBeUndefined();
    const firstRound = calls(fetchMock).filter((c) => c.url.includes("/index")).length;
    await deleteChunksForResource("u", "r");
    expect(calls(fetchMock).filter((c) => c.url.includes("/index")).length).toBeGreaterThan(firstRound);
  });

  it("can be called directly and is a single pass when it succeeds", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => ok());
    vi.stubGlobal("fetch", fetchMock);
    await ensurePayloadIndexes();
    await ensurePayloadIndexes();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("deleteChunksForUser", () => {
  it("deletes everything a student owns with one filtered request", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => ok());
    vi.stubGlobal("fetch", fetchMock);
    await deleteChunksForUser("student-1");
    const del = calls(fetchMock).filter((c) => c.url.endsWith("/points/delete"));
    expect(del).toHaveLength(1);
    expect(del[0].body).toEqual({ filter: { must: [{ key: "userId", match: { value: "student-1" } }] } });
  });

  it("reports a failed delete instead of pretending it worked", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => (String(url).endsWith("/points/delete") ? new Response("boom", { status: 500 }) : ok()));
    vi.stubGlobal("fetch", fetchMock);
    await expect(deleteChunksForUser("student-1")).rejects.toThrow("Qdrant user delete failed (500)");
  });
});
