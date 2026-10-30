// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminAiReport } from "@/src/library/billing/aiUsageReports";
import type { FeatureDetail, NotableRow } from "@/src/library/billing/dailyRollup";
import { DURATION_EDGES_MS } from "@/src/library/billing/histogram";

const mocks = vi.hoisted(() => ({ useAiReport: vi.fn() }));
vi.mock("./useAiReport", () => ({ useAiReport: mocks.useAiReport }));
import { AiFeatureDetail, AiFeatureDetailScreen } from "./AiFeatureDetail";

afterEach(cleanup);
beforeEach(() => mocks.useAiReport.mockReset());

const TZ = "America/Chicago";
type Feature = AdminAiReport["features"][number];
type Mode = "slow" | "cost" | "fail";

const notable = (o: Partial<NotableRow>): NotableRow => ({
  at: "2026-10-30T03:14:00.000Z", durationMs: 1000, status: "ok", model: "gemini-1.5-flash",
  inputTokens: 1000, outputTokens: 1000, costMicros: 0, httpStatus: null, errorKind: null, ...o,
});

const hist = (counts: Record<number, number>) => DURATION_EDGES_MS.map((_, i) => counts[i] ?? 0);

const detail = (o: Partial<FeatureDetail> & { feature: string }): FeatureDetail => ({
  durationHist: hist({}), durationEdgesMs: DURATION_EDGES_MS.slice(0, -1),
  p50Ms: null, p95Ms: null, p50AboveMs: null, p95AboveMs: null, timedCount: 0, requests: 0, errors: 0, errorKinds: {},
  notable: { slowest: [], costliest: [], failures: [] }, days: [], ...o,
});

const feature = (o: Partial<Feature> & { feature: string }): Feature => ({
  requests: 0, errors: 0, errorRate: 0, localRequests: 0, p50Ms: null, p95Ms: null, p50AboveMs: null, p95AboveMs: null, timedCount: 0, stages: null,
  inputTokens: 0, outputTokens: 0, costMicros: 0, notable: { slowest: [], costliest: [], failures: [] }, modelCounts: {}, ...o,
});

const report = (featureDetail: FeatureDetail | undefined, features: Feature[], o: Partial<AdminAiReport> = {}): AdminAiReport => ({
  since: "2026-10-23T00:00:00.000Z", until: "2026-10-30T00:00:00.000Z", truncated: false,
  features,
  total: { requests: 494, errors: 1, inputTokens: 0, outputTokens: 0, costMicros: 48_200_000, chargeMicros: 50_850_000, unknownCostRows: 0 },
  models: [], students: [], missingDays: [],
  money: {
    cashCollectedMicros: 0, creditGrantedMicros: 0, cashRefundedMicros: 0, netCashMicros: 0, trialGrantedMicros: 0, creditRefundedMicros: 0,
    costMicros: 48_200_000, chargeMicros: 50_850_000, marginMicros: 2_650_000, unusedBalanceMicros: 0, unusedBalanceAsOf: "2026-10-29",
  },
  source: "live", builtAt: "2026-10-30T08:00:00.000Z", staleReason: null,
  ...(featureDetail ? { featureDetail } : {}),
  ...o,
});

// Slowest -> quiz-generation, the approved mockup's figures where the histogram allows.
const slowRows = [
  notable({ at: "2026-10-30T03:14:00.000Z", durationMs: 21_400, inputTokens: 4200, outputTokens: 6100 }),
  notable({ at: "2026-10-30T01:03:00.000Z", durationMs: 18_900, inputTokens: 3800, outputTokens: 5400 }),
  notable({ at: "2026-10-28T19:17:00.000Z", durationMs: 16_200, inputTokens: 2900, outputTokens: 4800 }),
  notable({ at: "2026-10-28T00:41:00.000Z", durationMs: 14_800, inputTokens: 3100, outputTokens: 4200 }),
  notable({ at: "2026-10-27T18:05:00.000Z", durationMs: 13_900, inputTokens: 2700, outputTokens: 4100 }),
];
const quizDetail = detail({
  feature: "quiz-generation",
  // 3 s .. 30 s buckets; p50 lands in the 5 s bucket, p95 in the 15 s one.
  durationHist: hist({ 8: 10, 9: 20, 10: 25, 11: 15, 12: 8, 13: 4, 14: 2, 15: 2 }),
  p50Ms: 5000, p95Ms: 15000, timedCount: 86, requests: 86, errors: 0,
  notable: { slowest: slowRows, costliest: [], failures: [] },
});
const quiz = feature({ feature: "quiz-generation", requests: 86, inputTokens: 86 * 2600, costMicros: 8_310_000 });

// Most expensive -> chat.
const costRows = [
  notable({ at: "2026-10-30T02:02:00.000Z", costMicros: 310_000, inputTokens: 12_400, outputTokens: 18_200, durationMs: 12_800 }),
  notable({ at: "2026-10-29T21:11:00.000Z", costMicros: 280_000, inputTokens: 10_100, outputTokens: 15_400, durationMs: 9_600 }),
  notable({ at: "2026-10-28T23:33:00.000Z", costMicros: 260_000, inputTokens: 9_800, outputTokens: 14_100, durationMs: 8_700 }),
];
const chatDays = ["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29"].map((day, i) => ({
  day, requests: 60 + i, costMicros: 3_000_000 + i * 100_000, pricedRequests: 60 + i, maxCostMicros: 200_000 + i * 10_000,
}));
const chatDetail = detail({
  feature: "chat", requests: 402, timedCount: 390, p50Ms: 3000, p95Ms: 10_000,
  notable: { slowest: [], costliest: costRows, failures: [] },
  days: [...chatDays, { day: "2026-10-30", requests: 17, costMicros: 23_120_000 - chatDays.reduce((s, d) => s + d.costMicros, 0), pricedRequests: 15, maxCostMicros: 310_000 }],
});
const chat = feature({ feature: "chat", requests: 402, inputTokens: 402 * 3000, costMicros: 23_120_000 });

// Most failures -> advising-generate-schedule.
const failure = notable({
  at: "2026-10-29T22:17:00.000Z", status: "error", durationMs: null, httpStatus: 429, errorKind: "rate_limit", inputTokens: 2100, outputTokens: 0,
});
const adviseDetail = detail({
  feature: "advising-generate-schedule", requests: 6, errors: 1, timedCount: 5, p50Ms: 3000,
  errorKinds: { rate_limit: 1 }, notable: { slowest: [], costliest: [], failures: [failure] },
});
const advise = feature({ feature: "advising-generate-schedule", requests: 6, errors: 1, errorRate: 1 / 6 });

const fixtures: Record<Mode, { feature: string; report: AdminAiReport }> = {
  slow: { feature: "quiz-generation", report: report(quizDetail, [chat, quiz, advise]) },
  cost: { feature: "chat", report: report(chatDetail, [chat, quiz, advise]) },
  fail: { feature: "advising-generate-schedule", report: report(adviseDetail, [chat, quiz, advise]) },
};

const show = (mode: Mode, over: Partial<{ feature: string; report: AdminAiReport; days: number }> = {}) => {
  const f = { ...fixtures[mode], days: 7, ...over };
  return render(<AiFeatureDetail mode={mode} feature={f.feature} report={f.report} days={f.days} timeZone={TZ} />);
};

const QUESTIONS: Record<Mode, RegExp> = {
  slow: /which requests were slow, and was this unusual\?/i,
  cost: /what is driving the cost\?/i,
  fail: /what failed, when, and why\?/i,
};

/** The stat card whose label is exactly `label`. */
const stat = (label: string) => screen.getByText(label, { selector: "dt" }).closest("[data-stat]") as HTMLElement;
const rowsOf = (name: string) => within(screen.getByRole("table", { name })).getAllByRole("row").slice(1).map((r) => r.textContent);

describe("AiFeatureDetail framing", () => {
  it("opens with the question the page answers", () => {
    show("slow");
    expect(screen.getByText(/which requests were slow/i)).toBeTruthy();
  });

  it.each(["slow", "cost", "fail"] as const)("the %s view states its question before any number", (mode) => {
    show(mode);
    const question = screen.getByText(QUESTIONS[mode]);
    const firstFigure = document.querySelector("[data-stat]")!;
    expect(firstFigure).not.toBeNull();
    expect(question.compareDocumentPosition(firstFigure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("names the feature with its tone badge and one-line description", () => {
    show("slow");
    expect(screen.getByRole("heading", { level: 1, name: "quiz-generation" })).toBeTruthy();
    expect(screen.getByText("Slowest request time", { selector: "[data-badge]" })).toBeTruthy();
    expect(screen.getByText("Generates quiz questions from course content.", { selector: "[data-description]" })).toBeTruthy();
    cleanup();
    show("cost");
    expect(screen.getByText("Most expensive", { selector: "[data-badge]" })).toBeTruthy();
    expect(screen.getByText("General chat with the AI assistant.", { selector: "[data-description]" })).toBeTruthy();
    cleanup();
    show("fail");
    expect(screen.getByText("Most failures", { selector: "[data-badge]" })).toBeTruthy();
    expect(screen.getByText("Builds a personalised schedule from advising data.", { selector: "[data-description]" })).toBeTruthy();
  });

  it("leaves the description out for a feature that has none", () => {
    show("slow", { feature: "ocr", report: report(detail({ feature: "ocr" }), []) });
    expect(screen.getByRole("heading", { level: 1, name: "ocr" })).toBeTruthy();
    expect(document.querySelector("[data-description]")).toBeNull();
  });

  it("shows a breadcrumb back to the overview", () => {
    show("cost", { days: 14 });
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).getByRole("link", { name: "Analytics" }).getAttribute("href")).toBe("/admin/analytics");
    expect(within(nav).getByRole("link", { name: "AI performance" }).getAttribute("href")).toBe("/admin/analytics/ai?days=14");
    expect(within(nav).getByText("chat").getAttribute("aria-current")).toBe("page");
  });

  it("keeps the view when the window changes", () => {
    show("cost", { days: 14 });
    const nav = screen.getByRole("navigation", { name: "Time window" });
    expect(within(nav).getByRole("link", { name: "30d" }).getAttribute("href")).toBe("/admin/analytics/ai/feature/chat?view=cost&days=30");
    expect(within(nav).getByRole("link", { name: "14d" }).getAttribute("aria-current")).toBe("page");
  });

  it("shows the stale banner and names missing days", () => {
    show("slow", { report: { ...fixtures.slow.report, source: "snapshot", staleReason: "quota", missingDays: ["2026-10-27"] } });
    expect(screen.getByText(/daily Firestore quota used up/)).toBeTruthy();
    expect(screen.getByText("1 of 7 days has no data yet (nightly summary not built): 27 Oct.")).toBeTruthy();
  });

  it("says no summaries exist, not that nothing ran, when every window day is missing", () => {
    const missingDays = ["2026-10-29"];
    show("slow", { days: 1, report: report(detail({ feature: "quiz-generation" }), [], { missingDays }) });
    expect(screen.getByText("No nightly summaries for this window yet.")).toBeTruthy();
    expect(screen.getByText("1 of 1 day has no data yet (nightly summary not built): 29 Oct.")).toBeTruthy();
    expect(screen.queryByText(/no requests in the last/i)).toBeNull();
  });

  it("says when some days hit the request cap", () => {
    show("cost", { report: { ...fixtures.cost.report, truncated: true } });
    expect(screen.getByText("Some days hit the 20,000-request cap; figures for those days are partial.")).toBeTruthy();
  });

  it("says so, without blanking, when the report carries no detail for the feature", () => {
    show("slow", { report: report(undefined, [quiz]) });
    expect(screen.getByRole("heading", { level: 1, name: "quiz-generation" })).toBeTruthy();
    expect(screen.getByText(/no detail for this feature/i)).toBeTruthy();
  });
});

describe("AiFeatureDetail slow view", () => {
  it("shows worst case, typical and total requests", () => {
    show("slow");
    expect(within(stat("Worst case (p95)")).getByText("15.0 s")).toBeTruthy();
    expect(within(stat("Typical (p50)")).getByText("5.0 s")).toBeTruthy();
    expect(within(stat("Total requests")).getByText("86")).toBeTruthy();
  });

  it("draws the stored histogram with the p50 and p95 buckets marked", () => {
    show("slow");
    const chart = screen.getByRole("img", { name: /request time distribution/i });
    const bars = chart.querySelectorAll("[data-bucket]");
    // From the first non-empty bucket (3 s) to the last (30 s).
    expect([...bars].map((b) => b.getAttribute("data-bucket"))).toEqual(["8", "9", "10", "11", "12", "13", "14", "15"]);
    expect(chart.querySelector('[data-mark="p50"]')?.getAttribute("data-bucket")).toBe("10");
    expect(chart.querySelector('[data-mark="p95"]')?.getAttribute("data-bucket")).toBe("13");
    expect(screen.getByText("p50 · 5.0 s")).toBeTruthy();
    expect(screen.getByText("p95 · 15.0 s")).toBeTruthy();
  });

  it("says the distribution is accurate only to the bucket width", () => {
    show("slow");
    expect(screen.getByText("Bars come from the stored histogram, so times are accurate to the bucket width.")).toBeTruthy();
  });

  it("labels the open-topped last bucket without Infinity, and shows a p95 inside it as > 90 s, not a dash", () => {
    const tail = detail({ ...quizDetail, durationHist: hist({ 10: 5, 19: 1 }), timedCount: 6, p50Ms: 5000, p95Ms: null, p95AboveMs: 90_000 });
    const { container } = show("slow", { report: report(tail, [quiz]) });
    const chart = screen.getByRole("img", { name: /request time distribution/i });
    expect(within(chart).getByText("> 90 s")).toBeTruthy();
    expect(within(stat("Worst case (p95)")).getByText("> 90 s")).toBeTruthy();
    expect(screen.getByText("p95 · > 90 s")).toBeTruthy();
    expect(chart.querySelector('[data-mark="p95"]')?.getAttribute("data-bucket")).toBe("19");
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it("keeps the dash for fewer than 5 timed requests", () => {
    const few = detail({ ...quizDetail, durationHist: hist({ 10: 3, 19: 1 }), timedCount: 4, p50Ms: null, p95Ms: null });
    show("slow", { report: report(few, [quiz]) });
    expect(within(stat("Worst case (p95)")).getByText("—")).toBeTruthy();
    expect(within(stat("Typical (p50)")).getByText("—")).toBeTruthy();
  });

  it("lists the slowest requests with time, duration, status, model and tokens", () => {
    show("slow");
    expect(rowsOf("Slowest individual requests")).toEqual([
      "Oct 29, 10:14 PM21.4 sSuccessgemini-1.5-flash4.2K / 6.1K",
      "Oct 29, 8:03 PM18.9 sSuccessgemini-1.5-flash3.8K / 5.4K",
      "Oct 28, 2:17 PM16.2 sSuccessgemini-1.5-flash2.9K / 4.8K",
      "Oct 27, 7:41 PM14.8 sSuccessgemini-1.5-flash3.1K / 4.2K",
      "Oct 27, 1:05 PM13.9 sSuccessgemini-1.5-flash2.7K / 4.1K",
    ]);
  });

  it("notes that the slow requests sent more input than usual, only when every listed one did, without claiming a cause", () => {
    show("slow");
    expect(screen.getByText(
      "Every slow request listed here also sent more input than this feature's average (2.6K tokens per request); larger inputs may be a factor.",
    )).toBeTruthy();
    expect(screen.queryByText(/points at|rather than/)).toBeNull();
    cleanup();
    const mixed = { ...quizDetail, notable: { ...quizDetail.notable, slowest: [...slowRows.slice(0, 4), notable({ durationMs: 13_000, inputTokens: 900 })] } };
    show("slow", { report: report(mixed, [quiz]) });
    expect(screen.queryByText(/sent more input/)).toBeNull();
  });

  it("is calm and finite when the feature had no requests", () => {
    const { container } = show("slow", { report: report(detail({ feature: "quiz-generation" }), []) });
    expect(screen.getByText(/no requests in the last 7 days/i)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it("says when there are requests but none was timed", () => {
    show("slow", { report: report(detail({ feature: "quiz-generation", requests: 3, errors: 3 }), [quiz]) });
    expect(screen.getByText(/no timed requests/i)).toBeTruthy();
    expect(screen.queryByRole("img", { name: /request time distribution/i })).toBeNull();
  });
});

describe("AiFeatureDetail cost view", () => {
  it("shows total cost, the average over priced requests, total requests and the share of all AI cost", () => {
    show("cost");
    expect(within(stat("Total cost")).getByText("$23.12")).toBeTruthy();
    // $23.12 over 390 priced requests, not over all 402.
    expect(within(stat("Average per request")).getByText("$0.06")).toBeTruthy();
    expect(within(stat("Total requests")).getByText("402")).toBeTruthy();
    expect(within(stat("Of total AI cost")).getByText("48%")).toBeTruthy();
  });

  it("charts the average and the most expensive request per day, and no p95", () => {
    show("cost");
    const section = screen.getByRole("heading", { name: "Cost per day" }).closest("section")!;
    expect(within(section).getByText("Average")).toBeTruthy();
    expect(within(section).getByText("Most expensive")).toBeTruthy();
    expect(section.textContent).not.toMatch(/p95/i);
    const chart = within(section).getByRole("img", { name: /cost per day/i });
    expect(chart.querySelectorAll("[data-day]")).toHaveLength(7);
    expect(chart.querySelectorAll('[data-series="average"]')).toHaveLength(7);
    expect(chart.querySelectorAll('[data-series="max"]')).toHaveLength(7);
    expect(within(chart).getByText("Oct 24")).toBeTruthy();
  });

  it("shows a dash for the average when a day predates the priced count, or nothing was priced", () => {
    const old = { ...chatDetail, days: chatDetail.days.map((d, i) => (i === 0 ? { ...d, pricedRequests: null } : d)) };
    show("cost", { report: report(old, [chat]) });
    expect(within(stat("Average per request")).getByText("—")).toBeTruthy();
    cleanup();
    const unpriced = { ...chatDetail, days: chatDetail.days.map((d) => ({ ...d, costMicros: 0, pricedRequests: 0, maxCostMicros: null })) };
    const { container } = show("cost", { report: report(unpriced, [{ ...chat, costMicros: 0 }]) });
    expect(within(stat("Average per request")).getByText("—")).toBeTruthy();
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it("lists the most expensive requests with time, cost, tokens, duration and status", () => {
    show("cost");
    expect(rowsOf("Most expensive individual requests")).toEqual([
      "Oct 29, 9:02 PM$0.3112.4K / 18.2K12.8 sSuccess",
      "Oct 29, 4:11 PM$0.2810.1K / 15.4K9.6 sSuccess",
      "Oct 28, 6:33 PM$0.269.8K / 14.1K8.7 sSuccess",
    ]);
  });

  it("notes long inputs only when every listed request sent more than the average", () => {
    show("cost");
    expect(screen.getByText(
      "Every expensive request listed here also sent more input than this feature's average (3K tokens per request); longer inputs may be a factor.",
    )).toBeTruthy();
    expect(screen.queryByText(/points at|rather than/)).toBeNull();
    cleanup();
    show("cost", { report: report(chatDetail, [{ ...chat, inputTokens: 402 * 11_000 }]) });
    expect(screen.queryByText(/sent more input/)).toBeNull();
  });

  it("reads as a true zero when every request was free and local", () => {
    const local = detail({
      feature: "chat", requests: 30, timedCount: 30,
      days: [{ day: "2026-10-29", requests: 30, costMicros: 0, pricedRequests: 0, maxCostMicros: null }],
    });
    const { container } = show("cost", { report: report(local, [feature({ feature: "chat", requests: 30, localRequests: 30 })], { money: { ...fixtures.cost.report.money, costMicros: 0 } }) });
    expect(within(stat("Total cost")).getByText("$0.00")).toBeTruthy();
    expect(within(stat("Of total AI cost")).getByText("0%")).toBeTruthy();
    expect(screen.getByText(/no billed requests/i)).toBeTruthy();
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it("is calm and finite when the feature had no requests", () => {
    const { container } = show("cost", { report: report(detail({ feature: "chat" }), []), days: 1 });
    expect(screen.getByText(/no requests in the last 1 day/i)).toBeTruthy();
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });
});

describe("AiFeatureDetail fail view", () => {
  it("shows failed out of total, the failure rate and the typical time", () => {
    show("fail");
    expect(within(stat("Failed requests")).getByText("1 / 6")).toBeTruthy();
    expect(within(stat("Failure rate")).getByText("16.7%")).toBeTruthy();
    expect(within(stat("Typical (p50)")).getByText("3.0 s")).toBeTruthy();
  });

  it("splits the outcomes into failed and did not fail", () => {
    show("fail");
    const bar = screen.getByRole("img", { name: "1 failed, 5 did not fail, of 6 requests" });
    expect(bar.querySelector('[data-outcome="failed"]')?.getAttribute("style")).toContain("width: 16.6");
    expect(screen.getByText("Failed · 1")).toBeTruthy();
    expect(screen.getByText("Did not fail · 5")).toBeTruthy();
    expect(screen.getByText("Total: 6 requests")).toBeTruthy();
  });

  it("shows error kind and HTTP status but never message text", () => {
    const tainted = { ...failure, message: "the student's essay text" } as NotableRow;
    show("fail", { report: report({ ...adviseDetail, notable: { ...adviseDetail.notable, failures: [tainted] } }, [advise]) });
    expect(screen.getByText("429")).toBeTruthy();
    expect(screen.getAllByText(/rate limit/i).length).toBeGreaterThan(0);
    expect(rowsOf("Recent failed requests")).toEqual(["Oct 29, 5:17 PMRate limit429gemini-1.5-flash2.1K / 0"]);
    expect(document.body.textContent).not.toContain("essay");
  });

  it("explains that no error message text is stored", () => {
    show("fail");
    expect(screen.getByText(/No error message text is stored, because messages can carry student content\. Only the provider's status code and a coarse error kind\./)).toBeTruthy();
  });

  it("leaves out what the stored data cannot back: no charged column, no cost of failed work", () => {
    show("fail");
    expect(screen.queryByText(/charged/i)).toBeNull();
    expect(screen.queryByText(/cost of failed work/i)).toBeNull();
  });

  it("counts failures by error kind over the window and says when one kind explains them all", () => {
    show("fail", { days: 14 });
    const kinds = screen.getByRole("list", { name: "Error kinds" });
    expect(within(kinds).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Rate limit1", "Provider error0", "Timeout0", "Network0",
    ]);
    expect(screen.getByRole("heading", { name: "Error kinds · last 14 days" })).toBeTruthy();
    expect(screen.getByText("Every failure in this window was a rate limit.")).toBeTruthy();
  });

  it("lists unusual kinds too, and owns up to failures counted before kinds were recorded", () => {
    const mixed = { ...adviseDetail, errors: 5, errorKinds: { rate_limit: 1, aborted: 2 } };
    show("fail", { report: report(mixed, [advise]) });
    const items = within(screen.getByRole("list", { name: "Error kinds" })).getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toContain("Aborted2");
    expect(screen.queryByText(/Every failure in this window/)).toBeNull();
    expect(screen.getByText(/2 failures come from days summarised before error kinds were recorded/)).toBeTruthy();
  });

  it("is calm when nothing failed, and when nothing ran", () => {
    show("fail", { report: report({ ...adviseDetail, errors: 0, errorKinds: {}, notable: { slowest: [], costliest: [], failures: [] } }, [advise]) });
    expect(screen.getByText(/nothing failed in the last 7 days/i)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    cleanup();
    const { container } = show("fail", { report: report(detail({ feature: "advising-generate-schedule" }), []) });
    expect(screen.getByText(/no requests in the last 7 days/i)).toBeTruthy();
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });
});

describe("AiFeatureDetailScreen", () => {
  it("asks for the feature's report over the window", () => {
    mocks.useAiReport.mockReturnValue({ report: fixtures.cost.report, error: null, loading: false });
    render(<AiFeatureDetailScreen mode="cost" feature="chat" days={14} timeZone={TZ} />);
    expect(mocks.useAiReport).toHaveBeenCalledWith(14, "chat");
    expect(within(stat("Total cost")).getByText("$23.12")).toBeTruthy();
  });

  it("shows the endpoint's message for an unknown feature, keeping the breadcrumb and heading", () => {
    mocks.useAiReport.mockReturnValue({ report: null, error: "Unknown AI feature.", loading: false });
    render(<AiFeatureDetailScreen mode="slow" feature="not-a-feature" days={7} />);
    expect(screen.getByText("Unknown AI feature.")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "not-a-feature" })).toBeTruthy();
    expect(screen.getByText(QUESTIONS.slow)).toBeTruthy();
  });

  it("says it is loading", () => {
    mocks.useAiReport.mockReturnValue({ report: null, error: null, loading: true });
    render(<AiFeatureDetailScreen mode="fail" feature="chat" days={7} />);
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });
});
