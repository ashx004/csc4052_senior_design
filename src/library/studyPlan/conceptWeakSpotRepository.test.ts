import { describe, expect, it } from "vitest";
import { conceptWeakSpotId } from "./firestorePaths";

describe("conceptWeakSpotId", () => {
  it("builds a slash-free id from course and concept key", () => {
    expect(conceptWeakSpotId("c1", "chain rule")).toBe("c1|chain%20rule");
  });

  it("escapes a concept key containing a slash", () => {
    expect(conceptWeakSpotId("c1", "and/or logic")).toBe("c1|and%2For%20logic");
  });
});
