import { expect, it } from "vitest";
import { aiFeatureView, aiWindowDays, windowDays } from "./dashboardUtils";

it("reads a drill-down page's ?view=, falling back to slow when it is missing or unrecognised", () => {
  expect(aiFeatureView("slow")).toBe("slow");
  expect(aiFeatureView("cost")).toBe("cost");
  expect(aiFeatureView("fail")).toBe("fail");
  expect(aiFeatureView(["fail", "cost"])).toBe("fail");
  for (const raw of [undefined, "", "COST", "costs", "toString", []]) expect(aiFeatureView(raw), String(raw)).toBe("slow");
});

it("reads the AI pages' ?days=, clamped to 1..31", () => {
  expect(aiWindowDays("14")).toBe(14);
  expect(aiWindowDays("1")).toBe(1);
  expect(aiWindowDays("90")).toBe(31);
  expect(aiWindowDays("0")).toBe(1);
});
it("gives the AI pages 30 days when ?days= is absent or malformed", () => {
  expect(aiWindowDays(undefined)).toBe(30);
  expect(aiWindowDays("")).toBe(30);
  expect(aiWindowDays("7.5")).toBe(30);
  expect(aiWindowDays("-3")).toBe(30);
  expect(aiWindowDays("abc")).toBe(30);
  expect(aiWindowDays(["14", "30"])).toBe(14);
});

it("honours the Nd presets", () => {
  expect(windowDays("start=7days")).toBe(7);
  expect(windowDays("start=30days")).toBe(30);
  expect(windowDays("start=1days")).toBe(1);
});
it("falls back to 7 for custom ranges", () => {
  expect(windowDays("start=2026-01-01&end=2026-01-03")).toBe(7);
});
it("falls back to 7 when out of range or malformed", () => {
  expect(windowDays("start=90days")).toBe(7);
  expect(windowDays("start=0days")).toBe(7);
  expect(windowDays("start=abcdays")).toBe(7);
  expect(windowDays("")).toBe(7);
  expect(windowDays("start=2026-01-10&end=2026-01-01")).toBe(7);
});
