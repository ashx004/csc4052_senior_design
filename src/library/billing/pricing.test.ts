import { afterEach, describe, expect, it } from "vitest";
import { TASK_ESTIMATES, TASK_FEATURES, chargeForCost, estimateInputTokens, holdFor, measuredEstimates } from "./pricing";

afterEach(() => { delete process.env.BILLING_OPENROUTER_FEE; });

describe("pricing", () => {
  it("adds OpenRouter's 5.5% purchase fee so $1 of reported cost is fully paid for", () => {
    expect(chargeForCost(945_000, "openrouter:x")).toBe(1_000_000);
    expect(chargeForCost(1, "openrouter:x")).toBe(2); // rounded up, never down
    expect(chargeForCost(1000, "google:gemini-3.1-flash-lite")).toBe(1000);
    expect(chargeForCost(0, "openrouter:x")).toBe(0);
  });

  it("follows a changed fee and rejects a nonsense one", () => {
    process.env.BILLING_OPENROUTER_FEE = "0.08";
    expect(chargeForCost(920, "openrouter:x")).toBe(1000);
    process.env.BILLING_OPENROUTER_FEE = "abc";
    expect(() => chargeForCost(1, "openrouter:x")).toThrow();
  });

  it("holds the worst case across primary and fallback, with unknown models priced high", () => {
    const gemmaOnly = holdFor(["openrouter:google/gemma-4-26b-a4b-it"], 1000, 1000);
    const withFallback = holdFor(["openrouter:google/gemma-4-26b-a4b-it", "google:gemini-3.1-flash-lite"], 1000, 1000);
    expect(withFallback).toBeGreaterThan(gemmaOnly);
    expect(withFallback).toBe(1750); // Gemini: 1000 × 0.25 + 1000 × 1.5
    expect(holdFor(["openrouter:new/model"], 1000, 1000)).toBeGreaterThan(withFallback);
  });

  it("estimates input high, counting images", () => {
    expect(estimateInputTokens({ messages: [{ content: "x".repeat(300) }] })).toBe(100);
    expect(estimateInputTokens({ messages: [{ content: "", images: ["a", "b"] }] })).toBe(6000);
  });
});

describe("measuredEstimates", () => {
  it("uses the measured median where there is enough data", () => {
    const out = measuredEstimates(TASK_ESTIMATES, new Map([["quiz-generation", 4200]]));
    expect(out.find((e) => e.task === "Quiz (10 questions)")!.typicalUsd).toBeCloseTo(0.0042);
    expect(out.find((e) => e.task === "Chat message")).toEqual(TASK_ESTIMATES[0]);
  });

  it("keeps the hardcoded estimate for a feature with no data, or a zero median", () => {
    expect(measuredEstimates(TASK_ESTIMATES, new Map())).toEqual(TASK_ESTIMATES);
    expect(measuredEstimates(TASK_ESTIMATES, new Map([["chat", 0]]))).toEqual(TASK_ESTIMATES);
  });

  it("keeps the estimate when the median would print as $0.0000", () => {
    expect(measuredEstimates(TASK_ESTIMATES, new Map([["chat", 99]]))).toEqual(TASK_ESTIMATES);
    expect(measuredEstimates(TASK_ESTIMATES, new Map([["chat", 100]]))[0].typicalUsd).toBeCloseTo(0.0001);
  });

  it("only maps tasks that exist in the table", () => {
    const tasks = TASK_ESTIMATES.map((e) => e.task);
    for (const task of Object.keys(TASK_FEATURES)) expect(tasks).toContain(task);
  });
});
