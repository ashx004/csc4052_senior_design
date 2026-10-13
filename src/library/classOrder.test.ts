import { describe, expect, it } from "vitest";
import { sortByPosition } from "./classOrder";

describe("sortByPosition", () => {
  it("puts dragged classes first, in order, and keeps the rest in their original order", () => {
    const result = sortByPosition([{ id: "a" }, { id: "b", sortOrder: 1 }, { id: "c" }, { id: "d", sortOrder: 0 }]);
    expect(result.map((c) => c.id)).toEqual(["d", "b", "a", "c"]);
  });

  it("leaves a list nobody has reordered untouched", () => {
    expect(sortByPosition<{ id: string; sortOrder?: number }>([{ id: "a" }, { id: "b" }]).map((c) => c.id)).toEqual(["a", "b"]);
  });
});
