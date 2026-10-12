import { describe, expect, it } from "vitest";
import { primaryKeyOf, sameSourceSet, sourceKeysOf } from "./sourceIdentity";

describe("sourceKeysOf", () => {
  // Existing sets predate sourceKeys and must keep working with no migration.
  it("treats a legacy single-source set as a one-key list", () => {
    expect(sourceKeysOf({ sourceDocKey: "users/u/a.pdf" })).toEqual(["users/u/a.pdf"]);
  });

  it("prefers sourceKeys when present", () => {
    expect(sourceKeysOf({ sourceDocKey: "users/u/a.pdf", sourceKeys: ["users/u/a.pdf", "users/u/b.pdf"] })).toEqual([
      "users/u/a.pdf",
      "users/u/b.pdf",
    ]);
  });

  it("returns an empty list when neither field is set", () => {
    expect(sourceKeysOf({})).toEqual([]);
    expect(sourceKeysOf({ sourceDocKey: null, sourceKeys: null })).toEqual([]);
  });

  it("ignores an empty sourceKeys array in favor of sourceDocKey", () => {
    expect(sourceKeysOf({ sourceDocKey: "users/u/a.pdf", sourceKeys: [] })).toEqual(["users/u/a.pdf"]);
  });
});

describe("sameSourceSet", () => {
  it("matches regardless of order", () => {
    expect(sameSourceSet(["a", "b"], ["b", "a"])).toBe(true);
  });

  it("does not match a subset or a superset", () => {
    expect(sameSourceSet(["a"], ["a", "b"])).toBe(false);
    expect(sameSourceSet(["a", "b"], ["a"])).toBe(false);
  });

  it("ignores duplicates within a list", () => {
    expect(sameSourceSet(["a", "a", "b"], ["a", "b"])).toBe(true);
  });

  it("matches two empty lists", () => {
    expect(sameSourceSet([], [])).toBe(true);
  });
});

describe("primaryKeyOf", () => {
  it("is the first key, which keeps existing single-source queries working", () => {
    expect(primaryKeyOf(["users/u/a.pdf", "users/u/b.pdf"])).toBe("users/u/a.pdf");
  });

  it("is stable regardless of the order the student ticked the sources", () => {
    expect(primaryKeyOf(["b", "a"])).toBe(primaryKeyOf(["a", "b"]));
  });

  it("throws for an empty list rather than returning undefined", () => {
    expect(() => primaryKeyOf([])).toThrow("at least one source");
  });
});

describe('primaryKeyOf with synthetic keys', () => {
  it('prefers a real storage key over note: and resource: keys', () => {
    expect(primaryKeyOf(['note:n2', 'users/u/doc.pdf', 'resource:d1'])).toBe('users/u/doc.pdf');
  });
  it('still returns something when only synthetic keys exist', () => {
    expect(primaryKeyOf(['note:b', 'note:a'])).toBe('note:a');
  });
});
