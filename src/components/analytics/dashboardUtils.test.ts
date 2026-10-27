import { expect, it } from "vitest";
import { windowDays } from "./dashboardUtils";

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
