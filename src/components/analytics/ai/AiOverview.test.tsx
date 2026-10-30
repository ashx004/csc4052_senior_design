// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { AdminAiReport } from "@/src/library/billing/aiUsageReports";
import { AiOverview } from "./AiOverview";

afterEach(cleanup);

type Feature = AdminAiReport["features"][number];
const feature = (o: Partial<Feature> & { feature: string }): Feature => ({
  requests: 10, errors: 0, errorRate: 0, localRequests: 0,
  p50Ms: null, p95Ms: null, p50AboveMs: null, p95AboveMs: null, timedCount: 0, stages: null,
  inputTokens: 0, outputTokens: 0, costMicros: 0,
  notable: { slowest: [], costliest: [], failures: [] }, modelCounts: {},
  ...o,
});

// The approved mockup's figures.
const features: Feature[] = [
  feature({ feature: "chat", requests: 120, costMicros: 23_120_000, p95Ms: 9_000 }),
  feature({ feature: "quiz-generation", requests: 40, costMicros: 8_310_000, p95Ms: 21_400 }),
  feature({ feature: "flashcard-generation", requests: 30, costMicros: 5_620_000, p95Ms: 12_000 }),
  feature({ feature: "practice-generation", requests: 20, costMicros: 4_900_000 }),
  feature({ feature: "ocr", requests: 12, costMicros: 4_000_000 }),
  feature({ feature: "advising-generate-schedule", requests: 6, errors: 1, errorRate: 1 / 6, costMicros: 2_250_000 }),
];

const report = (o: Partial<AdminAiReport> = {}): AdminAiReport => ({
  since: "2026-10-23T00:00:00.000Z", until: "2026-10-30T00:00:00.000Z", truncated: false,
  features,
  total: { requests: 228, errors: 1, inputTokens: 0, outputTokens: 0, costMicros: 48_200_000, chargeMicros: 50_850_000, unknownCostRows: 0 },
  models: [], students: [], missingDays: [],
  money: {
    cashCollectedMicros: 184_000_000, creditGrantedMicros: 173_120_000, cashRefundedMicros: 20_000_000,
    netCashMicros: 164_000_000, trialGrantedMicros: 25_000_000, creditRefundedMicros: 1_800_000,
    costMicros: 48_200_000, chargeMicros: 50_850_000, marginMicros: 2_650_000, unusedBalanceMicros: 96_400_000, unusedBalanceAsOf: "2026-10-29",
  },
  source: "live", builtAt: "2026-10-30T08:00:00.000Z", staleReason: null,
  ...o,
});

const allLocalReport = report({
  features: [
    feature({ feature: "chat", requests: 30, localRequests: 30, p95Ms: 3_000 }),
    feature({ feature: "quiz-generation", requests: 5, localRequests: 5 }),
  ],
  total: { requests: 35, errors: 0, inputTokens: 900, outputTokens: 400, costMicros: 0, chargeMicros: 0, unknownCostRows: 0 },
  money: {
    cashCollectedMicros: 0, creditGrantedMicros: 0, cashRefundedMicros: 0, netCashMicros: 0,
    trialGrantedMicros: 0, creditRefundedMicros: 0, costMicros: 0, chargeMicros: 0, marginMicros: 0,
    unusedBalanceMicros: 0, unusedBalanceAsOf: "2026-10-29",
  },
});

/** The box whose label is exactly `label`: its figure, label and sub-label. */
const box = (label: string) => screen.getByText(label, { selector: "dt" }).closest("[data-money-box]") as HTMLElement;

describe("AiOverview money", () => {
  it("shows all nine money figures with their labels", () => {
    render(<AiOverview report={report()} days={7} />);
    const expected: [string, string][] = [
      ["Collected", "$184.00"], ["Refunded", "$20.00"], ["Net cash kept", "$164.00"],
      ["Credit granted", "$173.12"], ["Unused balance", "$96.40"], ["Trial credit given", "$25.00"],
      ["AI cost", "$48.20"], ["Margin", "$2.65"], ["Lost to failures", "$1.80"],
    ];
    for (const [label, value] of expected) {
      expect(within(box(label)).getByText(value)).toBeTruthy();
    }
    expect(document.querySelectorAll("[data-money-box]")).toHaveLength(9);
    for (const group of ["Cash", "Credit", "AI"]) expect(screen.getByRole("heading", { name: group })).toBeTruthy();
  });

  it("labels the unused balance as point-in-time, naming the day it was read from", () => {
    render(<AiOverview report={report()} days={7} />);
    expect(within(box("Unused balance")).getByText("Paid but not spent (as of 29 Oct)")).toBeTruthy();
  });

  it("shows a dash, not $0.00, when no day in the window recorded a balance", () => {
    render(<AiOverview report={report({ money: { ...report().money, unusedBalanceMicros: null, unusedBalanceAsOf: null } })} days={7} />);
    const balance = box("Unused balance");
    expect(within(balance).getByText("—")).toBeTruthy();
    expect(within(balance).getByText("Paid but not spent")).toBeTruthy();
    expect(balance.textContent).not.toContain("$");
  });

  it("says refunds are credit taken back, not cash returned", () => {
    render(<AiOverview report={report()} days={7} />);
    expect(within(box("Refunded")).getByText("Credit taken back on refunds and disputes")).toBeTruthy();
    expect(within(box("Net cash kept")).getByText("Collected minus credit taken back")).toBeTruthy();
    expect(within(box("AI cost")).getByText("What providers billed you")).toBeTruthy();
    expect(within(box("Margin")).getByText("Charged to students minus AI cost")).toBeTruthy();
  });

  it("marks money refunded for failed work as a loss", () => {
    render(<AiOverview report={report()} days={7} />);
    const lost = box("Lost to failures");
    expect(within(lost).getByText("Refunded to students, still billed to you")).toBeTruthy();
    expect(lost.getAttribute("data-tone")).toBe("loss");
  });

  it("shows a negative figure with the sign before the dollar", () => {
    render(<AiOverview report={report({ money: { ...report().money, netCashMicros: -5_000_000 } })} days={7} />);
    expect(within(box("Net cash kept")).getByText("-$5.00")).toBeTruthy();
  });

  it("says how many requests with unresolved cost are left out, only when there are any", () => {
    render(<AiOverview report={report({ total: { ...report().total, unknownCostRows: 3 } })} days={7} />);
    expect(screen.getByText("3 requests with unresolved cost are excluded from cost and margin.")).toBeTruthy();
    cleanup();
    render(<AiOverview report={report()} days={7} />);
    expect(screen.queryByText(/unresolved cost/)).toBeNull();
  });

  it("renders a true zero rather than an empty state when every request was free and local", () => {
    const { container } = render(<AiOverview report={allLocalReport} days={7} />);
    expect(within(box("AI cost")).getByText("$0.00")).toBeTruthy();
    expect(screen.getAllByText("$0.00").length).toBeGreaterThanOrEqual(9);
    expect(screen.queryByText(/no data/i)).toBeNull();
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it("names the window in each section heading", () => {
    render(<AiOverview report={report()} days={14} />);
    expect(screen.getAllByText("· Last 14 days")).toHaveLength(3);
  });
});

describe("AiOverview needs attention", () => {
  it("names the most expensive feature by total spend and its share, not a per-request figure", () => {
    render(<AiOverview report={report()} days={7} />);
    const card = screen.getByRole("link", { name: /Most expensive/ });
    expect(card.textContent).toContain("chat");
    expect(card.textContent).toContain("$23.12");
    expect(screen.getByText("48% of AI spend")).toBeTruthy();
    expect(card.getAttribute("href")).toBe("/admin/analytics/ai/feature/chat?view=cost&days=7");
  });

  it("names the slowest feature by worst case (p95), saying it is to bucket width", () => {
    render(<AiOverview report={report()} days={7} />);
    const card = screen.getByRole("link", { name: /Slowest/ });
    expect(card.textContent).toContain("quiz-generation");
    expect(card.textContent).toContain("21.4 s");
    expect(card.textContent).toContain("worst case (p95, to bucket width)");
    expect(card.getAttribute("href")).toBe("/admin/analytics/ai/feature/quiz-generation?view=slow&days=7");
  });

  it("ranks a p95 above the last bucket edge as the slowest, shown as > 90 s", () => {
    const withTail = [
      ...features,
      // 89.9 s would be the slowest with an edge of its own; the open bucket beats it.
      feature({ feature: "syllabus", requests: 8, p95Ms: 90_000, timedCount: 8 }),
      feature({ feature: "embeddings", requests: 9, p95Ms: null, p95AboveMs: 90_000, timedCount: 9 }),
    ];
    render(<AiOverview report={report({ features: withTail })} days={7} />);
    const card = screen.getByRole("link", { name: /Slowest/ });
    expect(card.textContent).toContain("embeddings");
    expect(card.textContent).toContain("> 90 s");
    expect(card.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it("shows a card for a feature with no drill-down page as plain text, not a link to a 400", () => {
    const unlisted = [feature({ feature: "brand-new-feature", requests: 50, costMicros: 40_000_000 }), ...features.slice(1)];
    render(<AiOverview report={report({ features: unlisted })} days={7} />);
    expect(screen.queryByRole("link", { name: /Most expensive/ })).toBeNull();
    const text = screen.getByText("No detail page is available for this feature.");
    const card = text.closest("[data-tone]") as HTMLElement;
    expect(card.getAttribute("data-tone")).toBe("cost");
    expect(card.textContent).toContain("brand-new-feature");
    expect(card.querySelector("a")).toBeNull();
    // A listed background feature still links.
    cleanup();
    render(<AiOverview report={report({ features: [feature({ feature: "chat-summarize", costMicros: 1_000 })] })} days={7} />);
    expect(screen.getByRole("link", { name: /Most expensive/ }).getAttribute("href")).toBe("/admin/analytics/ai/feature/chat-summarize?view=cost&days=7");
  });

  it("does not take a constructor-shaped id for a listed feature", () => {
    render(<AiOverview report={report({ features: [feature({ feature: "constructor", costMicros: 1_000 })] })} days={7} />);
    expect(screen.queryByRole("link", { name: /Most expensive/ })).toBeNull();
  });

  it("names the feature with the most failures as failed out of requests", () => {
    render(<AiOverview report={report()} days={30} />);
    const card = screen.getByRole("link", { name: /Most failures/ });
    expect(card.textContent).toContain("advising-generate-schedule");
    expect(card.textContent).toContain("1 / 6");
    expect(card.textContent).toContain("failed");
    expect(card.getAttribute("href")).toBe("/admin/analytics/ai/feature/advising-generate-schedule?view=fail&days=30");
  });

  it("shows a calm card, not a link, when nothing qualifies", () => {
    render(<AiOverview report={report({ features: [feature({ feature: "chat" })] })} days={7} />);
    expect(screen.queryAllByRole("link", { name: /Slowest|Most expensive|Most failures/ })).toHaveLength(0);
    expect(screen.getByText("No feature has enough timed requests yet")).toBeTruthy();
    expect(screen.getByText("No AI spend in this window")).toBeTruthy();
    expect(screen.getByText("No failures in this window")).toBeTruthy();
  });
});

describe("AiOverview cost breakdown", () => {
  it("the donut total, its legend total and the AI cost box all agree", () => {
    render(<AiOverview report={report()} days={7} />);
    expect(within(box("AI cost")).getByText("$48.20")).toBeTruthy();
    expect(within(screen.getByRole("img", { name: /AI cost by feature/ })).getByText("$48.20")).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Cost by feature" })).getByText("$48.20")).toBeTruthy();
    expect(screen.getAllByText("$48.20")).toHaveLength(3);
  });

  it("lists the four most expensive features, then everything else as All others", () => {
    render(<AiOverview report={report()} days={7} />);
    const rows = within(screen.getByRole("list", { name: "Cost by feature" })).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      "chat48%$23.12",
      "quiz-generation17%$8.31",
      "flashcard-generation12%$5.62",
      "practice-generation10%$4.90",
      "All others13%$6.25",
      "Total$48.20",
    ]);
  });

  it("leaves out All others when there is nothing else", () => {
    render(<AiOverview report={report({ features: features.slice(0, 2), total: { ...report().total, costMicros: 31_430_000 }, money: { ...report().money, costMicros: 31_430_000 } })} days={7} />);
    const list = screen.getByRole("list", { name: "Cost by feature" });
    expect(within(list).queryByText("All others")).toBeNull();
    expect(within(list).getAllByText("$31.43")).toHaveLength(1);
  });

  it("links to the detailed analysis for the same window", () => {
    render(<AiOverview report={report()} days={14} />);
    expect(screen.getByRole("link", { name: "Detailed analysis" }).getAttribute("href")).toBe("/admin/analytics/ai/details?days=14");
  });
});

describe("AiOverview data honesty", () => {
  it("shows the stale banner with the data's age when the source is a snapshot", () => {
    render(<AiOverview report={report({ source: "snapshot", staleReason: "quota", builtAt: "2026-10-30T04:40:00.000Z" })} days={7} />);
    const banner = screen.getByRole("status");
    expect(banner.textContent).toMatch(/^Showing data from \d+ Oct, \d+:40 [AP]M\./);
    expect(banner.textContent).toContain("daily Firestore quota used up");
  });

  it("shows no banner for live data", () => {
    render(<AiOverview report={report()} days={7} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says which days have no summary yet instead of passing them off as zero", () => {
    render(<AiOverview report={report({ missingDays: ["2026-10-27", "2026-10-28", "2026-10-29"] })} days={7} />);
    expect(screen.getByText("3 of 7 days have no data yet (nightly summary not built): 27 Oct, 28 Oct, 29 Oct.")).toBeTruthy();
  });

  it("uses the singular for one missing day", () => {
    render(<AiOverview report={report({ missingDays: ["2026-10-29"] })} days={1} />);
    expect(screen.getByText("1 of 1 day has no data yet (nightly summary not built): 29 Oct.")).toBeTruthy();
  });

  it("shows an empty state, not a page of zeros, when no day in the window has a summary", () => {
    const empty = report({
      features: [], total: { requests: 0, errors: 0, inputTokens: 0, outputTokens: 0, costMicros: 0, chargeMicros: 0, unknownCostRows: 0 },
      missingDays: ["2026-10-28", "2026-10-29"], source: "snapshot", staleReason: "quota",
      money: { ...allLocalReport.money, unusedBalanceMicros: null, unusedBalanceAsOf: null },
    });
    render(<AiOverview report={empty} days={2} />);
    expect(screen.getByText("No nightly summaries for this window yet.")).toBeTruthy();
    expect(screen.getByText("2 of 2 days have no data yet (nightly summary not built): 28 Oct, 29 Oct.")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("daily Firestore quota used up");
    expect(document.querySelectorAll("[data-money-box]")).toHaveLength(0);
    expect(screen.queryByText("$0.00")).toBeNull();
    expect(screen.queryByText(/Needs attention/)).toBeNull();
  });

  it("says when some days hit the request cap, only then", () => {
    render(<AiOverview report={report({ truncated: true })} days={7} />);
    expect(screen.getByText("Some days hit the 20,000-request cap; figures for those days are partial.")).toBeTruthy();
    cleanup();
    render(<AiOverview report={report()} days={7} />);
    expect(screen.queryByText(/request cap/)).toBeNull();
  });
});
