// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { AnalyticsPerformance, formatCost } from "./AnalyticsPerformance";
import type {
  FeatureStats,
  PerformanceReport,
} from "@/src/library/billing/aiPerformance";

afterEach(cleanup);
const feature = (o: Partial<FeatureStats> = {}): FeatureStats => ({
  feature: "chat", requests: 40, errors: 2, errorRate: 0.05, localRequests: 0,
  p50Ms: 1200, p95Ms: 4000,
  stages: { waitMs: 300, genMs: 800, overheadMs: 50, deliverMs: 50 },
  inputTokens: 1000, outputTokens: 500, costMicros: 2_500_000, ...o,
});
const reportWith = (
  o: Partial<FeatureStats> = {},
  r: Partial<PerformanceReport> = {},
): PerformanceReport => ({
  since: "a", until: "b", truncated: false, features: [feature(o)],
  total: { requests: 40, errors: 2, inputTokens: 1000, outputTokens: 500, costMicros: 2_500_000 },
  ...r,
});

it("shows a dash instead of a percentile when there is too little data", () => {
  render(<AnalyticsPerformance report={reportWith({ p50Ms: null, p95Ms: null, requests: 3 })} />);
  expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
});
it("says total only for a feature that never streamed", () => {
  render(<AnalyticsPerformance report={reportWith({ stages: null })} />);
  expect(screen.getByText(/total only/i)).toBeTruthy();
});
it("warns when the row cap was hit", () => {
  render(<AnalyticsPerformance report={reportWith({}, { truncated: true })} />);
  expect(screen.getByRole("alert").textContent).toMatch(/partial/i);
});
it("does not warn when complete", () => {
  render(<AnalyticsPerformance report={reportWith()} />);
  expect(screen.queryByRole("alert")).toBeNull();
});
it("labels the residual stage honestly and omits null stages", () => {
  const { container } = render(
    <AnalyticsPerformance report={reportWith({ stages: { waitMs: null, genMs: 800, overheadMs: 5000, deliverMs: null } })} />,
  );
  expect(screen.getByText(/Other \(incl\. retries\)/)).toBeTruthy();
  expect(screen.queryByText(/our processing/i)).toBeNull();
  expect(container.querySelector('[data-stage="waitMs"]')).toBeNull();
  expect(container.querySelectorAll("[data-stage]")).toHaveLength(2);
});
it("mentions free local calls", () => {
  render(<AnalyticsPerformance report={reportWith({ localRequests: 3 })} />);
  expect(screen.getByText(/3 of 40 free local calls/)).toBeTruthy();
});
it("formats cost as currency, not micros", () => {
  expect(formatCost(2_500_000)).toBe("$2.50");
  render(<AnalyticsPerformance report={reportWith()} />);
  expect(screen.queryByText("2500000")).toBeNull();
});
it("sizes stage segments in proportion", () => {
  const { container } = render(
    <AnalyticsPerformance report={reportWith({ stages: { waitMs: 100, genMs: 300, overheadMs: null, deliverMs: 600 } })} />,
  );
  const w = (k: string) =>
    (container.querySelector(`[data-stage="${k}"]`) as HTMLElement).style.width;
  expect(w("waitMs")).toBe("10%");
  expect(w("genMs")).toBe("30%");
  expect(w("deliverMs")).toBe("60%");
  expect(container.querySelector('[aria-hidden="true"] [data-stage]')).toBeTruthy();
  expect(screen.getByText(/average split across streamed requests/i)).toBeTruthy();
});
it("never shows a real tiny cost as $0.00", () => {
  expect(formatCost(10)).toBe("<$0.0001");
  expect(formatCost(0)).toBe("$0.00");
  render(<AnalyticsPerformance report={reportWith({ costMicros: 10 })} />);
  expect(screen.getAllByText("<$0.0001").length).toBeGreaterThan(0);
});
it("states the window in use in the heading", () => {
  render(<AnalyticsPerformance report={reportWith()} days={30} />);
  expect(screen.getByRole("heading", { name: /Last 30 days/ })).toBeTruthy();
});
