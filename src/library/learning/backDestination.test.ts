import { describe, expect, it } from "vitest";
import { resolveBackDestination, safeReturnPath } from "./backDestination";

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
