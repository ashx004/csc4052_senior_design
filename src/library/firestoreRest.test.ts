import { describe, expect, it, vi, beforeEach } from "vitest";
import { firestoreListCollection, firestoreRunQuery, firestoreCommitBatch } from "./firestoreRest";

const PROJECT_ID = "studora-933f8";
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

describe("firestoreListCollection", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an empty array when the collection has no documents", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    const result = await firestoreListCollection("token", "users/u1/enrollment");
    expect(result).toEqual([]);
  });

  it("parses each document's id (from name) and fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        documents: [
          {
            name: `projects/${PROJECT_ID}/databases/(default)/documents/users/u1/enrollment/c1`,
            fields: { classCode: { stringValue: "CSC 101" } },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await firestoreListCollection("token", "users/u1/enrollment");

    expect(fetchMock).toHaveBeenCalledWith(
      `${FIRESTORE_BASE}/users/u1/enrollment?pageSize=300`,
      expect.objectContaining({ headers: { Authorization: "Bearer token" } })
    );
    expect(result).toEqual([{ id: "c1", data: { classCode: "CSC 101" } }]);
  });

  it("fetches the next page with pageToken and concatenates documents", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          documents: [
            {
              name: `projects/${PROJECT_ID}/databases/(default)/documents/users/u1/enrollment/c1`,
              fields: { classCode: { stringValue: "CSC 101" } },
            },
          ],
          nextPageToken: "token-abc",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          documents: [
            {
              name: `projects/${PROJECT_ID}/databases/(default)/documents/users/u1/enrollment/c2`,
              fields: { classCode: { stringValue: "CSC 102" } },
            },
          ],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await firestoreListCollection("token", "users/u1/enrollment");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${FIRESTORE_BASE}/users/u1/enrollment?pageSize=300`,
      expect.objectContaining({ headers: { Authorization: "Bearer token" } })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${FIRESTORE_BASE}/users/u1/enrollment?pageSize=300&pageToken=token-abc`,
      expect.objectContaining({ headers: { Authorization: "Bearer token" } })
    );
    expect(result).toEqual([
      { id: "c1", data: { classCode: "CSC 101" } },
      { id: "c2", data: { classCode: "CSC 102" } },
    ]);
  });

  it("returns an empty array on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    const result = await firestoreListCollection("token", "users/u1/enrollment");
    expect(result).toEqual([]);
  });
});

describe("firestoreRunQuery", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs a structured query with orderBy and limit", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    await firestoreRunQuery("token", "users/u1", "chatSessions", {
      orderByField: "updatedAt",
      direction: "DESCENDING",
      limit: 5,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${FIRESTORE_BASE}/users/u1:runQuery`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: "chatSessions" }],
            orderBy: [{ field: { fieldPath: "updatedAt" }, direction: "DESCENDING" }],
            limit: 5,
          },
        }),
      })
    );
  });

  it("filters out result entries with no document and parses the rest", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            document: {
              name: `projects/${PROJECT_ID}/databases/(default)/documents/users/u1/chatSessions/s1`,
              fields: { title: { stringValue: "Session 1" } },
            },
          },
          { readTime: "2026-08-12T00:00:00Z" },
        ],
      })
    );

    const result = await firestoreRunQuery("token", "users/u1", "chatSessions", {
      orderByField: "updatedAt",
      limit: 5,
    });

    expect(result).toEqual([{ id: "s1", data: { title: "Session 1" } }]);
  });

  it("returns an empty array on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    const result = await firestoreRunQuery("token", "users/u1", "chatSessions", {
      orderByField: "updatedAt",
      limit: 5,
    });
    expect(result).toEqual([]);
  });
});

describe("firestoreCommitBatch", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs all writes to the :commit endpoint with full resource names", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    await firestoreCommitBatch("token", [
      { path: "users/u1/enrollment/c1/resources/r1/chunks/chunk_0", fields: { text: "hello", chunkIndex: 0 } },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      `${FIRESTORE_BASE}:commit`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          writes: [
            {
              update: {
                name: `projects/${PROJECT_ID}/databases/(default)/documents/users/u1/enrollment/c1/resources/r1/chunks/chunk_0`,
                fields: { text: { stringValue: "hello" }, chunkIndex: { integerValue: 0 } },
              },
            },
          ],
        }),
      })
    );
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "server error" })
    );
    await expect(firestoreCommitBatch("token", [{ path: "a/b", fields: {} }])).rejects.toThrow();
  });
});
