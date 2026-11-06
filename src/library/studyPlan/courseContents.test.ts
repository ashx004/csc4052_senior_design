import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadCourseContents } from "./courseContents";

// A Firestore stand-in in the style of conceptPracticeTask.test.ts: each collection path maps
// either to the documents it holds or to an error the read should reject with.
const { store } = vi.hoisted(() => ({
  store: {
    collections: new Map<string, { id: string; data: Record<string, unknown> }[] | Error>(),
    getDocsCalls: [] as string[],
    getDocsFromServerCalls: [] as string[],
  },
}));

function snapshotFor(path: string, caller: "getDocs" | "getDocsFromServer") {
  if (caller === "getDocs") store.getDocsCalls.push(path);
  else store.getDocsFromServerCalls.push(path);
  const entry = store.collections.get(path);
  if (entry instanceof Error) throw entry;
  const docs = entry ?? [];
  return { docs: docs.map((d) => ({ id: d.id, data: () => d.data })) };
}

vi.mock("@/src/library/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, ...path: string[]) => ({ path: path.join("/") }),
  // The default-source read, which falls back to the cache when the server is unreachable.
  // Recorded so a test can prove this module never uses it.
  getDocs: async (ref: { path: string }) => snapshotFor(ref.path, "getDocs"),
  getDocsFromServer: async (ref: { path: string }) => snapshotFor(ref.path, "getDocsFromServer"),
}));

const base = "users/u1/enrollment";

function setCourse(
  classId: string,
  parts: {
    resources?: { id: string; data?: Record<string, unknown> }[] | Error;
    quizSets?: { id: string }[] | Error;
    flashcardSets?: { id: string }[] | Error;
  }
) {
  const put = (name: string, value: unknown) => {
    if (value === undefined) return;
    if (value instanceof Error) {
      store.collections.set(`${base}/${classId}/${name}`, value);
      return;
    }
    store.collections.set(
      `${base}/${classId}/${name}`,
      (value as { id: string; data?: Record<string, unknown> }[]).map((d) => ({
        id: d.id,
        data: d.data ?? {},
      }))
    );
  };
  put("resources", parts.resources);
  put("quizSets", parts.quizSets);
  put("flashcardSets", parts.flashcardSets);
}

/** What the Firebase SDK rejects with when the server cannot be reached. */
function unavailable(): Error {
  const error = new Error("Failed to get documents from server.");
  (error as Error & { code: string }).code = "unavailable";
  return error;
}

beforeEach(() => {
  store.collections.clear();
  store.getDocsCalls.length = 0;
  store.getDocsFromServerCalls.length = 0;
});

describe("loadCourseContents", () => {
  it("returns a populated CourseContents for a successful read", async () => {
    setCourse("c1", {
      resources: [{ id: "res-1", data: { sourceDocKey: "uploads/a.pdf" } }],
      quizSets: [{ id: "quiz-1" }],
      flashcardSets: [{ id: "fc-1" }],
    });

    const byCourse = await loadCourseContents("u1", ["c1"]);

    expect(byCourse.get("c1")).toEqual({
      resources: [{ id: "res-1", sourceDocKey: "uploads/a.pdf" }],
      quizSetIds: new Set(["quiz-1"]),
      flashcardSetIds: new Set(["fc-1"]),
    });
  });

  it("stores null for a course whose read throws", async () => {
    setCourse("c1", { resources: new Error("permission-denied") });

    const byCourse = await loadCourseContents("u1", ["c1"]);

    expect(byCourse.get("c1")).toBeNull();
  });

  it("stores null when the server is unreachable instead of answering from the cache", async () => {
    // This is the invariant: a read that never reached the server must never be recorded as a
    // successful "this course holds nothing". getDocs would resolve here from its local cache
    // (metadata.fromCache === true) and every quiz and flashcard task would be deleted;
    // getDocsFromServer rejects, so the failure lands in the catch and the course is unknown.
    setCourse("c1", {
      resources: [{ id: "res-1" }],
      quizSets: unavailable(),
      flashcardSets: unavailable(),
    });

    const byCourse = await loadCourseContents("u1", ["c1"]);

    expect(byCourse.get("c1")).toBeNull();
  });

  it("never reads through the cache-falling-back default source", async () => {
    setCourse("c1", { resources: [], quizSets: [], flashcardSets: [] });

    await loadCourseContents("u1", ["c1"]);

    expect(store.getDocsCalls).toEqual([]);
    expect(store.getDocsFromServerCalls).toHaveLength(3);
  });

  it("stores null, never a half-built CourseContents, when one collection fails", async () => {
    setCourse("c1", {
      resources: [{ id: "res-1" }],
      quizSets: new Error("quizSets unavailable"),
      flashcardSets: [{ id: "fc-1" }],
    });

    const byCourse = await loadCourseContents("u1", ["c1"]);

    expect(byCourse.get("c1")).toBeNull();
  });

  it("keeps one course's failure from hiding another course's successful read", async () => {
    setCourse("c1", { resources: [{ id: "res-1" }], quizSets: [], flashcardSets: [] });
    setCourse("c2", { resources: unavailable() });

    const byCourse = await loadCourseContents("u1", ["c1", "c2"]);

    expect(byCourse.get("c1")).not.toBeNull();
    expect(byCourse.get("c2")).toBeNull();
  });

  it("records an empty course as empty, so a genuinely cleared course does prune", async () => {
    setCourse("c1", { resources: [], quizSets: [], flashcardSets: [] });

    expect(await loadCourseContents("u1", ["c1"])).toEqual(
      new Map([
        ["c1", { resources: [], quizSetIds: new Set(), flashcardSetIds: new Set() }],
      ])
    );
  });
});
