// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminAiReport } from "@/src/library/billing/aiUsageReports";
import { AiDetails, AiDetailsScreen } from "./AiDetails";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Feature = AdminAiReport["features"][number];
const feature = (o: Partial<Feature> & { feature: string }): Feature => ({
  requests: 10, errors: 0, errorRate: 0, localRequests: 0,
  p50Ms: 1_000, p95Ms: 2_000, p50AboveMs: null, p95AboveMs: null, timedCount: 10, stages: null,
  inputTokens: 1_000, outputTokens: 2_000, costMicros: 0,
  modelCounts: { "openrouter:google/gemini-1.5-flash": 10 },
  notable: { slowest: [], costliest: [], failures: [] },
  ...o,
});

const studentFeatures: Feature[] = [
  // embeddings has the most requests and the least cost.
  feature({ feature: "embeddings", requests: 1_200, costMicros: 40_000, p50Ms: null, p95Ms: null, timedCount: 3, modelCounts: { "openrouter:openai/text-embedding-3-large": 1_200 } }),
  feature({
    feature: "chat", requests: 402, costMicros: 2_500_000, p50Ms: 1_800, p95Ms: 7_600, inputTokens: 1_200, outputTokens: 3_800,
    stages: { waitMs: 480, genMs: 1_420, overheadMs: 160, deliverMs: 80 },
    modelCounts: { "openrouter:anthropic/claude-3.5-sonnet": 390, "ollama:llama3": 12 },
  }),
  feature({ feature: "quiz-generation", requests: 86, costMicros: 1_200_000, p50Ms: 4_200, p95Ms: 21_400 }),
  feature({ feature: "ocr", requests: 28, costMicros: 600_000 }),
  feature({ feature: "contextual-chunking", requests: 46, costMicros: 400_000, modelCounts: { "openrouter:openai/text-embedding-3-large": 46 } }),
  feature({ feature: "syllabus", requests: 16, costMicros: 60_000 }),
];
const backgroundFeatures: Feature[] = [
  feature({ feature: "warm-model", requests: 10, costMicros: 0 }),
  feature({ feature: "advising-unspecified", requests: 5, costMicros: 200_000 }),
  feature({ feature: "mystery-feature", requests: 2, costMicros: 40_000 }),
];

const ids = ["a1b2c3d4", "f9e8d7c6", "c3d4e5f6", "b7a6c5d4", "d1e2f3a4", "e5f6a7b8", "a9b8c7d6", "c5d4e3f2", "b1c2d3e4", "f5e4d3c2", "d9c8b7a6", "e1f2a3b4"];
const students: AdminAiReport["students"] = [
  ...ids.map((id, i) => ({ shortUid: `${id}…`, requests: 200 - i * 10, chargeMicros: 6_420_000 - i * 400_000 })),
  // A wallet with no request in the window must not count as active.
  { shortUid: "00000000…", requests: 0, chargeMicros: 0 },
];

const money: AdminAiReport["money"] = {
  cashCollectedMicros: 184_000_000, creditGrantedMicros: 173_120_000, cashRefundedMicros: 20_000_000,
  netCashMicros: 164_000_000, trialGrantedMicros: 25_000_000, creditRefundedMicros: 1_800_000,
  costMicros: 5_040_000, chargeMicros: 5_320_000, marginMicros: 280_000, unusedBalanceMicros: 96_400_000, unusedBalanceAsOf: "2026-10-29",
};

const report = (o: Partial<AdminAiReport> = {}): AdminAiReport => ({
  since: "2026-10-23T00:00:00.000Z", until: "2026-10-30T00:00:00.000Z", truncated: false,
  features: [...studentFeatures, ...backgroundFeatures],
  total: { requests: 1_795, errors: 0, inputTokens: 0, outputTokens: 0, costMicros: 5_040_000, chargeMicros: 5_320_000, unknownCostRows: 0 },
  models: [
    { model: "openrouter:anthropic/claude-3.5-sonnet", requests: 426, totalDurationMs: 3_134_000, p50Ms: 1_900, p95Ms: 8_100, p50AboveMs: null, p95AboveMs: null, inputTokens: 1_200, outputTokens: 3_800, costMicros: 23_720_000, fallbacks: 3 },
    { model: "openrouter:openai/text-embedding-3-large", requests: 58, totalDurationMs: 192_000, p50Ms: 800, p95Ms: 3_500, p50AboveMs: null, p95AboveMs: null, inputTokens: 4_800, outputTokens: 0, costMicros: 2_300_000, fallbacks: 0 },
  ],
  students, missingDays: [], money,
  source: "live", builtAt: "2026-10-30T08:00:00.000Z", staleReason: null,
  ...o,
});

const table = (name: RegExp) => screen.getByRole("table", { name });
/** Body rows only, as arrays of cell text. */
const bodyRows = (t: HTMLElement) =>
  within(t).getAllByRole("row").filter((r) => r.closest("tbody")).map((r) => within(r).getAllByRole("cell").map((c) => c.textContent ?? ""));
const rowFor = (t: HTMLElement, name: string) => {
  const found = within(t).getAllByRole("row").find((r) => within(r).queryAllByRole("cell")[0]?.textContent?.startsWith(name));
  if (!found) throw new Error(`no row for ${name}`);
  return found;
};

describe("AiDetails student features", () => {
  it("sorts features by cost descending, not by request count", () => {
    render(<AiDetails report={report()} days={7} />);
    const names = bodyRows(table(/student features/i)).map((cells) => cells[0]);
    expect(names.map((n) => n.split(/runs/)[0])).toEqual(["chat", "quiz-generation", "ocr", "contextual-chunking", "syllabus", "embeddings"]);
  });

  it("has no error rate column", () => {
    render(<AiDetails report={report()} days={7} />);
    expect(screen.queryByText(/error rate/i)).toBeNull();
    const headers = within(table(/student features/i)).getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Feature", "Model requested", "Requests", "Typical (p50)", "Worst (p95)", "Tokens in / out", "Cost ↓"]);
  });

  it("renders one row per feature, with no 'total only' filler row", () => {
    render(<AiDetails report={report()} days={7} />);
    expect(screen.queryByText(/total only/i)).toBeNull();
    expect(bodyRows(table(/student features/i))).toHaveLength(studentFeatures.length);
  });

  it("shows a dash for a feature with fewer than 5 timed requests", () => {
    render(<AiDetails report={report()} days={7} />);
    const cells = within(rowFor(table(/student features/i), "embeddings")).getAllByRole("cell");
    expect(cells[3].textContent).toBe("—");
    expect(cells[4].textContent).toBe("—");
    expect(within(rowFor(table(/student features/i), "chat")).getAllByRole("cell")[3].textContent).toBe("1.8 s");
  });

  it("shows > 90 s for a percentile above the last bucket, and footnotes only the features with fewer than 5 timed", () => {
    const slow = feature({ feature: "ocr", requests: 28, costMicros: 600_000, timedCount: 20, p50Ms: 4_000, p95Ms: null, p95AboveMs: 90_000 });
    render(<AiDetails report={report({ features: studentFeatures.map((f) => (f.feature === "ocr" ? slow : f)) })} days={7} />);
    const cells = within(rowFor(table(/student features/i), "ocr")).getAllByRole("cell");
    expect(cells[3].textContent).toBe("4.0 s");
    expect(cells[4].textContent).toBe("> 90 s");
    const footnote = screen.getByText(/show a dash because|shows a dash because/).closest("p")!;
    expect(within(footnote).getByText("embeddings")).toBeTruthy();
    expect(within(footnote).queryByText("ocr")).toBeNull();
    expect(footnote.textContent).toContain("shows a dash because it has fewer than 5 timed requests");
  });

  it("notes that contextual-chunking runs once per chunk and embeddings many times per document", () => {
    render(<AiDetails report={report()} days={7} />);
    const t = table(/student features/i);
    expect(within(rowFor(t, "contextual-chunking")).getByText("runs once per chunk")).toBeTruthy();
    expect(within(rowFor(t, "embeddings")).getByText("runs many times per document")).toBeTruthy();
  });

  it("labels the model column as the requested model", () => {
    render(<AiDetails report={report()} days={7} />);
    expect(within(table(/student features/i)).getByRole("columnheader", { name: "Model requested" })).toBeTruthy();
    expect(screen.getByText(/the model we asked for, not confirmed as the one that answered/i)).toBeTruthy();
  });

  it("shows the most-used requested model, with how many others were asked for", () => {
    render(<AiDetails report={report()} days={7} />);
    const t = table(/student features/i);
    expect(within(rowFor(t, "chat")).getAllByRole("cell")[1].textContent).toBe("openrouter:anthropic/claude-3.5-sonnet +1 more");
    expect(within(rowFor(t, "ocr")).getAllByRole("cell")[1].textContent).toBe("openrouter:google/gemini-1.5-flash");
  });

  it("shows a dash for the model when the days predate model counts", () => {
    render(<AiDetails report={report({ features: [feature({ feature: "chat", costMicros: 1, modelCounts: {} })] })} days={7} />);
    expect(within(rowFor(table(/student features/i), "chat")).getAllByRole("cell")[1].textContent).toBe("—");
  });

  it("says percentiles are accurate to a histogram bucket", () => {
    render(<AiDetails report={report()} days={7} />);
    expect(screen.getByText(/accurate to the bucket width/i)).toBeTruthy();
  });

  it("carries tokens and cost with a share bar on each row", () => {
    render(<AiDetails report={report()} days={7} />);
    const chat = rowFor(table(/student features/i), "chat");
    const cells = within(chat).getAllByRole("cell");
    expect(cells[5].textContent).toBe("1.2K / 3.8K");
    expect(cells[6].textContent).toBe("$2.50");
    expect(within(chat).getByRole("img", { name: "50% of AI cost" })).toBeTruthy();
  });
});

describe("AiDetails models", () => {
  it("shows each model's total time, percentiles, cost and fallbacks", () => {
    render(<AiDetails report={report()} days={7} />);
    const sonnet = within(rowFor(table(/^models/i), "openrouter:anthropic/claude-3.5-sonnet")).getAllByRole("cell").map((c) => c.textContent);
    expect(sonnet).toEqual(["openrouter:anthropic/claude-3.5-sonnet", "426", "52m 14s", "1.9 s", "8.1 s", "1.2K / 3.8K", "$23.72", "3"]);
    expect(within(rowFor(table(/^models/i), "openrouter:openai")).getAllByRole("cell")[2].textContent).toBe("3m 12s");
  });

  it("shows > 90 s for a model whose percentile lies above the last bucket", () => {
    const models = report().models.map((m, i) => (i === 0 ? { ...m, p50Ms: null, p95Ms: null, p50AboveMs: 90_000, p95AboveMs: 90_000 } : m));
    render(<AiDetails report={report({ models })} days={7} />);
    const cells = within(rowFor(table(/^models/i), "openrouter:anthropic/claude-3.5-sonnet")).getAllByRole("cell").map((c) => c.textContent);
    expect(cells.slice(3, 5)).toEqual(["> 90 s", "> 90 s"]);
  });

  it("says what total time and fallbacks mean", () => {
    render(<AiDetails report={report()} days={7} />);
    expect(screen.getByText(/answers .which model is working hardest/i)).toBeTruthy();
    expect(screen.getByText(/counts times this model was tried after another one failed/i)).toBeTruthy();
  });
});

describe("AiDetails chat timing", () => {
  it("states that stage timings exist for streamed requests only", () => {
    render(<AiDetails report={report()} days={7} />);
    expect(screen.getByText(/only chat streams its answer, so only chat can be broken into stages/i)).toBeTruthy();
    const bar = screen.getByRole("img", { name: /chat time by stage/i });
    expect(bar.querySelectorAll("[data-stage]")).toHaveLength(4);
    for (const [label, value] of [["Waiting", "480 ms"], ["Generating", "1,420 ms"], ["Our own code", "160 ms"], ["Delivery", "80 ms"]]) {
      expect(screen.getByText(label).parentElement?.textContent).toContain(value);
    }
  });

  it("says no chat request streamed instead of drawing an empty bar", () => {
    const features = report().features.map((f) => (f.feature === "chat" ? { ...f, stages: null } : f));
    render(<AiDetails report={report({ features })} days={7} />);
    expect(screen.getByText(/no streamed chat requests in this window/i)).toBeTruthy();
    expect(screen.queryByRole("img", { name: /chat time by stage/i })).toBeNull();
  });
});

describe("AiDetails background work", () => {
  it("collapses background work by default", () => {
    render(<AiDetails report={report()} days={7} />);
    const button = screen.getByRole("button", { name: /background work/i });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.textContent).toContain("3 features · 17 requests · $0.24");
    expect(screen.queryByRole("table", { name: /background work/i })).toBeNull();
  });

  it("opens to the same columns, holding every feature that is not a student feature", () => {
    render(<AiDetails report={report()} days={7} />);
    const button = screen.getByRole("button", { name: /background work/i });
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const t = table(/background work/i);
    expect(within(t).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(
      ["Feature", "Model requested", "Requests", "Typical (p50)", "Worst (p95)", "Tokens in / out", "Cost ↓"],
    );
    expect(bodyRows(t).map((cells) => cells[0].split(/a call/)[0])).toEqual(["advising-unspecified", "mystery-feature", "warm-model"]);
    expect(within(rowFor(t, "advising-unspecified")).getByText("a call site forgot to label itself")).toBeTruthy();
    expect(within(table(/student features/i)).queryByText("mystery-feature")).toBeNull();
  });
});

describe("AiDetails students", () => {
  it("shows shortened student ids and never a full uid", () => {
    render(<AiDetails report={report()} days={7} />);
    const rows = bodyRows(table(/top 10 spenders/i));
    expect(rows).toHaveLength(10);
    expect(rows[0]).toEqual(["a1b2c3d4…", "200", "$6.42"]);
    for (const [id] of rows) {
      expect(id.endsWith("…")).toBe(true);
      expect(id.length).toBe(9);
    }
    expect(screen.getByText("Shortened ids only. No email, no full id.")).toBeTruthy();
  });

  it("shows cost per active student over the students who actually used AI", () => {
    // $5.04 of AI cost over the 12 students with a request; the 13th wallet had none.
    render(<AiDetails report={report()} days={7} />);
    expect(screen.getByText("$0.42")).toBeTruthy();
    expect(screen.getByText(/12 students used AI this week/i)).toBeTruthy();
  });

  it("shows a dash, not NaN, when no student used AI", () => {
    const { container } = render(<AiDetails report={report({ students: [] })} days={14} />);
    expect(screen.getByText(/no student used AI in this window/i)).toBeTruthy();
    expect(within(screen.getByTestId("cost-per-student")).getByText("—")).toBeTruthy();
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });
});

describe("AiDetails cost per dollar earned", () => {
  it("shows cost per feature per dollar earned", () => {
    // chat: $2.50 of AI cost against $164.00 of net cash is 1.5 cents per dollar.
    render(<AiDetails report={report()} days={7} />);
    const t = screen.getByRole("table", { name: /per dollar earned/i });
    const rows = bodyRows(t);
    expect(rows).toHaveLength(studentFeatures.length);
    expect(rows[0]).toEqual(["chat", "1.5¢"]);
    expect(within(rowFor(t, "embeddings")).getAllByRole("cell")[1].textContent).toBe("<0.1¢");
  });

  it("renders the per-dollar table without dividing by zero when nothing was earned", () => {
    const { container } = render(<AiDetails report={report({ money: { ...money, netCashMicros: 0, cashCollectedMicros: 0 } })} days={7} />);
    const rows = bodyRows(screen.getByRole("table", { name: /per dollar earned/i }));
    expect(rows).toHaveLength(studentFeatures.length);
    for (const [, cents] of rows) expect(cents).toBe("—");
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it("treats negative net cash as nothing earned", () => {
    render(<AiDetails report={report({ money: { ...money, netCashMicros: -5_000_000 } })} days={7} />);
    for (const [, cents] of bodyRows(screen.getByRole("table", { name: /per dollar earned/i }))) expect(cents).toBe("—");
  });
});

describe("AiDetails data honesty", () => {
  it("renders a true zero when every request was free and local", () => {
    const free = report({
      features: [feature({ feature: "chat", requests: 30, localRequests: 30, costMicros: 0, modelCounts: { "ollama:llama3": 30 } })],
      models: [{ model: "ollama:llama3", requests: 30, totalDurationMs: 30_000, p50Ms: 1_000, p95Ms: 2_000, p50AboveMs: null, p95AboveMs: null, inputTokens: 0, outputTokens: 0, costMicros: 0, fallbacks: 0 }],
      students: [{ shortUid: "a1b2c3d4…", requests: 30, chargeMicros: 0 }],
      money: { ...money, cashCollectedMicros: 0, netCashMicros: 0, costMicros: 0, chargeMicros: 0, marginMicros: 0 },
    });
    const { container } = render(<AiDetails report={free} days={7} />);
    expect(within(screen.getByTestId("cost-per-student")).getByText("$0.00")).toBeTruthy();
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it("shows the stale banner and the missing days, like the overview", () => {
    render(<AiDetails report={report({ source: "snapshot", staleReason: "quota", missingDays: ["2026-10-28", "2026-10-29"] })} days={7} />);
    expect(screen.getByRole("status").textContent).toContain("daily Firestore quota used up");
    expect(screen.getByText("2 of 7 days have no data yet (nightly summary not built): 28 Oct, 29 Oct.")).toBeTruthy();
  });

  it("names the window in each section heading", () => {
    render(<AiDetails report={report()} days={14} />);
    expect(screen.getAllByText("· Last 14 days").length).toBeGreaterThanOrEqual(4);
  });

  it("shows an empty state instead of tables when no day in the window has a summary", () => {
    const empty = report({
      features: [], models: [], students: [], missingDays: ["2026-10-29"],
      total: { requests: 0, errors: 0, inputTokens: 0, outputTokens: 0, costMicros: 0, chargeMicros: 0, unknownCostRows: 0 },
      money: { ...money, cashCollectedMicros: 0, creditGrantedMicros: 0, cashRefundedMicros: 0, netCashMicros: 0, trialGrantedMicros: 0,
        creditRefundedMicros: 0, costMicros: 0, chargeMicros: 0, marginMicros: 0, unusedBalanceMicros: null, unusedBalanceAsOf: null },
    });
    render(<AiDetails report={empty} days={1} />);
    expect(screen.getByText("No nightly summaries for this window yet.")).toBeTruthy();
    expect(screen.getByText("1 of 1 day has no data yet (nightly summary not built): 29 Oct.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByTestId("cost-per-student")).toBeNull();
  });

  it("says when some days hit the request cap", () => {
    render(<AiDetails report={report({ truncated: true })} days={7} />);
    expect(screen.getByText("Some days hit the 20,000-request cap; figures for those days are partial.")).toBeTruthy();
  });
});

describe("AiDetailsScreen", () => {
  it("links back to the overview for the same window, even while loading", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<AiDetailsScreen days={14} />);
    expect(screen.getByRole("link", { name: /back to overview/i }).getAttribute("href")).toBe("/admin/analytics/ai?days=14");
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });
});
