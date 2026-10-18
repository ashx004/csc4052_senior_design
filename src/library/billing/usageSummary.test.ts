import { describe, expect, it } from "vitest";
import { summarizeUsage, type UsageRow } from "./usageSummary";

const row = (over: Partial<UsageRow>): UsageRow => ({ uid: "s1", feature: "chat", model: "openrouter:m", inputTokens: 10, outputTokens: 5, costMicros: 100, costSource: "provider", requestId: "g", incomplete: false, at: new Date("2026-10-18T23:30:00Z"), ...over });

describe("summarizeUsage", () => {
  it("totals by UTC day, provider, student and feature, and flags gaps", () => {
    const s = summarizeUsage([
      row({}),
      row({ uid: "s2", at: new Date("2026-10-19T00:10:00Z") }),
      row({ uid: null, feature: "ocr", model: "google:g", costSource: "rate-table" }),
      row({ incomplete: true, costMicros: 0 }),
    ]);
    expect(s.total).toMatchObject({ requests: 4, costMicros: 300 });
    expect(s.byProviderDay.get("openrouter 2026-10-18")?.requests).toBe(2);
    expect(s.byProviderDay.get("openrouter 2026-10-19")?.requests).toBe(1);
    expect(s.byProviderDay.get("google 2026-10-18")?.costMicros).toBe(100);
    expect(s.byUser.get("s1")?.requests).toBe(2);
    expect(s.unattributed.get("ocr")?.requests).toBe(1);
    expect(s.needsCost).toHaveLength(1);
  });
});
