import { describe, expect, it } from "vitest";
import { chunkPointId } from "./vectorStore";

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
