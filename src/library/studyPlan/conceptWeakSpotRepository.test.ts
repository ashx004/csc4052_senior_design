import { describe, expect, it, vi } from "vitest";
import { conceptMasteryData, createConceptWeakSpotRepository } from "./conceptWeakSpotRepository";
import { conceptWeakSpotId } from "./firestorePaths";

const batchSet = vi.fn();
vi.mock("firebase/firestore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("firebase/firestore")>()),
  doc: (_db: unknown, path: string) => ({ path }),
  writeBatch: () => ({ set: batchSet, commit: async () => {} }),
}));
vi.mock("@/src/library/firebase", () => ({ db: {} }));

describe("conceptWeakSpotId", () => {
  it("builds a slash-free id from course and concept key", () => {
    expect(conceptWeakSpotId("c1", "chain rule")).toBe("c1|chain%20rule");
  });

  it("escapes a concept key containing a slash", () => {
    expect(conceptWeakSpotId("c1", "and/or logic")).toBe("c1|and%2For%20logic");
  });
});

describe("conceptMasteryData", () => {
  const base = { conceptKey: "a", value: 70, level: "developing", sourceSessionIds: [] };

  it("stores the level the concept was last asked at", () => {
    expect(conceptMasteryData("c1", { ...base, lastAskedLevel: "exam" })).toMatchObject({
      lastAskedLevel: "exam",
    });
  });

  it("leaves the key out when no level is supplied", () => {
    expect(conceptMasteryData("c1", base)).not.toHaveProperty("lastAskedLevel");
  });

  it("writes an explicit null to clear the level", () => {
    expect(conceptMasteryData("c1", { ...base, lastAskedLevel: null })).toHaveProperty(
      "lastAskedLevel",
      null,
    );
  });

  it("keeps the mastery band separate from the level asked", () => {
    expect(conceptMasteryData("c1", { ...base, lastAskedLevel: "challenge" })).toMatchObject({
      level: "developing",
      lastAskedLevel: "challenge",
    });
  });
});

describe("focused-session mastery save", () => {
  it("merges and carries no lastAskedLevel, so a stored level survives", async () => {
    batchSet.mockClear();
    const repo = createConceptWeakSpotRepository("u1");

    await repo.saveConceptMastery("c1", [
      { conceptKey: "a", value: 70, level: "developing", sourceSessionIds: ["s1"] },
    ]);

    expect(batchSet).toHaveBeenCalledTimes(1);
    const [, data, options] = batchSet.mock.calls[0];
    expect(options).toEqual({ merge: true });
    expect(data).not.toHaveProperty("lastAskedLevel");
  });
});
