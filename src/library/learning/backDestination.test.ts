import { describe, expect, it } from "vitest";
import { resolveBackDestination, resolveHistoryDepth, safeReturnPath } from "./backDestination";

describe("safeReturnPath", () => {
  it("accepts an internal path", () => {
    expect(safeReturnPath("/learning/study-plan")).toBe("/learning/study-plan");
  });

  it("accepts an internal path with a query string", () => {
    expect(safeReturnPath("/learning/study-plan?taskId=t1")).toBe("/learning/study-plan?taskId=t1");
  });

  it("rejects a protocol-relative path", () => {
    expect(safeReturnPath("//evil.com")).toBeNull();
  });

  it("rejects an absolute URL", () => {
    expect(safeReturnPath("https://evil.com/x")).toBeNull();
  });

  it("rejects a backslash-relative path", () => {
    expect(safeReturnPath("/\\evil.com")).toBeNull();
  });

  it("rejects a path not starting with a slash", () => {
    expect(safeReturnPath("learning")).toBeNull();
  });

  it("rejects control characters the browser would strip", () => {
    expect(safeReturnPath("/\t/evil.com")).toBeNull();
    expect(safeReturnPath("/\n/evil.com")).toBeNull();
    expect(safeReturnPath("/\r/evil.com")).toBeNull();
  });

  it("rejects null, undefined and blank", () => {
    expect(safeReturnPath(null)).toBeNull();
    expect(safeReturnPath(undefined)).toBeNull();
    expect(safeReturnPath("   ")).toBeNull();
  });
});

describe("resolveBackDestination", () => {
  it("prefers a safe from path", () => {
    expect(resolveBackDestination({ from: "/learning/study-plan", hasInAppHistory: true }))
      .toEqual({ kind: "path", path: "/learning/study-plan" });
  });

  it("uses history when from is unsafe but there is in-app history", () => {
    expect(resolveBackDestination({ from: "https://evil.com", hasInAppHistory: true })).toEqual({ kind: "history" });
  });

  it("uses history when there is no from", () => {
    expect(resolveBackDestination({ from: null, hasInAppHistory: true })).toEqual({ kind: "history" });
  });

  it("falls back on a cold entry", () => {
    expect(resolveBackDestination({ from: null, hasInAppHistory: false })).toEqual({ kind: "fallback" });
  });

  it("still prefers a safe from on a cold entry", () => {
    expect(resolveBackDestination({ from: "/learning", hasInAppHistory: false }))
      .toEqual({ kind: "path", path: "/learning" });
  });
});

describe("resolveHistoryDepth", () => {
  it("treats a cold entry as depth 1 with no in-app history", () => {
    expect(resolveHistoryDepth({ recordedDepth: null, storedCounter: 0 }))
      .toEqual({ depth: 1, stamp: true, hasInAppHistory: false });
  });

  it("treats a newly pushed entry as depth 2 with in-app history", () => {
    expect(resolveHistoryDepth({ recordedDepth: null, storedCounter: 1 }))
      .toEqual({ depth: 2, stamp: true, hasInAppHistory: true });
  });

  it("keeps the recorded depth on a refresh or back/forward without re-stamping", () => {
    expect(resolveHistoryDepth({ recordedDepth: 2, storedCounter: 3 }))
      .toEqual({ depth: 2, stamp: false, hasInAppHistory: true });
  });

  it("keeps a recorded depth of 1 as a cold entry", () => {
    expect(resolveHistoryDepth({ recordedDepth: 1, storedCounter: 4 }))
      .toEqual({ depth: 1, stamp: false, hasInAppHistory: false });
  });
});
