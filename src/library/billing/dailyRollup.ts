// One summary document per UTC day of aiUsage (aiUsageDaily/{day}), and the merge of several days
// into one report. Histograms stand in for raw durations so a window's percentiles need no raw reads. No Firebase here.
import type { AiStatus } from "@/src/library/ai/aiFetch";
import {
  isBilled, isError, isIncomplete, isLocal, isTimed,
  type FeatureStats, type PerformanceReport, type PerformanceRow,
} from "./aiPerformance";
import {
  CHARGE_EDGES_MICROS, DURATION_EDGES_MS, mergeHistograms, percentileAboveFromHistogram, percentileFromHistogram, toHistogram,
} from "./histogram";
import type { MoneySummary } from "./moneySummary";

type Stages = { waitMs: number; genMs: number; overheadMs: number; deliverMs: number };

/** One request, kept whole for the drill-down tables. Never a uid, never message text. */
export type NotableRow = {
  at: string; // ISO
  durationMs: number | null; status: AiStatus; model: string;
  inputTokens: number; outputTokens: number; costMicros: number;
  httpStatus: number | null; errorKind: string | null;
};
export type Notable = { slowest: NotableRow[]; costliest: NotableRow[]; failures: NotableRow[] };

export type FeatureDay = {
  requests: number; errors: number; localRequests: number;
  inputTokens: number; outputTokens: number;
  /** Cost and charge leave out local, failed and unknown-cost rows, so a margin taken from them is real. */
  costMicros: number; chargeMicros: number;
  /** Billed rows left out of cost because their price was never resolved. */
  unknownCostRows: number;
  durationHist: number[]; chargeHist: number[]; timedCount: number;
  /** Per stage, over streamed timed rows that recorded it; sum / count is the exact mean. */
  stageSums: Stages;
  stageCounts: Stages;
  notable: Notable;
  /** Rows per requested model. Absent on documents built before it was recorded. */
  modelCounts?: Record<string, number>;
  /** Failed rows per coarse error kind ("unknown" when none was recorded). Absent on documents built before it was recorded. */
  errorKinds?: Record<string, number>;
  /** The rows costMicros is summed over, so cost / pricedRequests is the average. Absent on documents built before it was recorded. */
  pricedRequests?: number;
};
export type ModelDay = {
  requests: number; errors: number; fallbacks: number;
  /** Over every row that recorded a duration, failed and stopped ones included: how hard the model worked. */
  totalDurationMs: number;
  inputTokens: number; outputTokens: number; costMicros: number;
  durationHist: number[]; timedCount: number;
};
export type StudentDay = { requests: number; chargeMicros: number };
export type DailyRollup = {
  day: string; // "YYYY-MM-DD", UTC
  rowsRead: number; truncated: boolean;
  features: Record<string, FeatureDay>;
  models: Record<string, ModelDay>;
  students: Record<string, StudentDay>; // key is the SHORTENED uid
  /** Filled in by the store; null until then. */
  money: MoneySummary | null;
  /** Point-in-time sum of wallet balances, filled in by the store. */
  unusedBalanceMicros: number | null;
};

/** A histogram percentile whose answer lies in the open-topped bucket has no edge, so its p50Ms/p95Ms is null like one
 * taken over fewer than 5 values. These tell the two apart: the last finite edge (90 000) it lies above, else null. */
export type OpenPercentiles = { p50AboveMs: number | null; p95AboveMs: number | null };
export type ModelStats = OpenPercentiles & {
  model: string; requests: number; totalDurationMs: number;
  p50Ms: number | null; p95Ms: number | null;
  inputTokens: number; outputTokens: number; costMicros: number; fallbacks: number;
};
export type StudentStats = { shortUid: string; requests: number; chargeMicros: number };
export type MergedRollup = Omit<PerformanceReport, "features" | "total"> & {
  /** modelCounts is the model each request asked for, not necessarily the one that answered. timedCount is what the percentiles are taken over. */
  features: (FeatureStats & OpenPercentiles & { timedCount: number; notable: Notable; modelCounts: Record<string, number> })[];
  /** chargeMicros and costMicros leave out the same rows, so their difference is the margin; unknownCostRows counts what was left out. */
  total: PerformanceReport["total"] & { chargeMicros: number; unknownCostRows: number };
  models: ModelStats[]; students: StudentStats[];
  /** Days with no document between the earliest and latest day present. */
  missingDays: string[];
  /** Each field summed over the days that have money; null when none does. */
  money: MoneySummary | null;
  /** From the newest day that recorded one. */
  unusedBalanceMicros: number | null;
  /** That day; null when no day recorded a balance. */
  unusedBalanceAsOf: string | null;
};

export type FeatureDetailDay = {
  day: string; requests: number; costMicros: number;
  /** Null for a day built before the count was recorded. */
  pricedRequests: number | null;
  /** The day's costliest request; null when nothing was priced. */
  maxCostMicros: number | null;
};
/** One feature over a window, for its drill-down page. */
export type FeatureDetail = OpenPercentiles & {
  feature: string;
  /** One count per bucket; the last bucket is open-topped, holding everything above the last edge. */
  durationHist: number[];
  /** Upper edge of every bucket but the open-topped last one, so the list survives JSON (Infinity would become null). */
  durationEdgesMs: number[];
  p50Ms: number | null; p95Ms: number | null;
  timedCount: number; requests: number; errors: number;
  errorKinds: Record<string, number>;
  notable: Notable;
  /** Oldest first, one per day that has a document; a day without one is left out, not shown as zero. */
  days: FeatureDetailDay[];
};

const SLOWEST = 5, COSTLIEST = 5, FAILURES = 10;
const DAY_MS = 86_400_000;

/** Rows whose cost and charge are real figures: billed, with a resolved price. */
const isPriced = (row: PerformanceRow) => isBilled(row) && row.costSource !== "unknown";
const isStreamed = (row: PerformanceRow) => isTimed(row) && row.waitMs !== null;
const sum = (rows: PerformanceRow[], pick: (r: PerformanceRow) => number) => rows.reduce((s, r) => s + pick(r), 0);

const notableRow = (r: PerformanceRow): NotableRow => ({
  at: r.at.toISOString(), durationMs: r.durationMs, status: r.status, model: r.model,
  inputTokens: r.inputTokens, outputTokens: r.outputTokens, costMicros: r.costMicros,
  httpStatus: r.httpStatus ?? null, errorKind: r.errorKind ?? null,
});

const slowestFirst = (rows: NotableRow[]) => [...rows].sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0)).slice(0, SLOWEST);
const costliestFirst = (rows: NotableRow[]) => [...rows].sort((a, b) => b.costMicros - a.costMicros).slice(0, COSTLIEST);
const newestFirst = (rows: NotableRow[]) => [...rows].sort((a, b) => b.at.localeCompare(a.at)).slice(0, FAILURES);

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const list = out.get(key(item)) ?? [];
    list.push(item);
    out.set(key(item), list);
  }
  return out;
}

function featureDay(list: PerformanceRow[]): FeatureDay {
  const timed = list.filter(isTimed);
  const priced = list.filter(isPriced);
  const streamed = list.filter(isStreamed);
  const stage = (pick: (r: PerformanceRow) => number | null) => {
    const present = streamed.map(pick).filter((v): v is number => v !== null);
    return { sum: present.reduce((a, b) => a + b, 0), count: present.length };
  };
  const wait = stage((r) => r.waitMs), gen = stage((r) => r.genMs), overhead = stage((r) => r.overheadMs), deliver = stage((r) => r.deliverMs);
  return {
    requests: list.length,
    errors: list.filter(isError).length,
    localRequests: list.filter(isLocal).length,
    // Token totals deliberately include error and local rows, as summarizePerformance does.
    inputTokens: sum(list, (r) => r.inputTokens),
    outputTokens: sum(list, (r) => r.outputTokens),
    costMicros: sum(priced, (r) => r.costMicros),
    chargeMicros: sum(priced, (r) => r.chargeMicros),
    unknownCostRows: list.filter((r) => isBilled(r) && r.costSource === "unknown").length,
    durationHist: toHistogram(timed.map((r) => r.durationMs as number), DURATION_EDGES_MS),
    // The rows medianChargeByFeature takes its /billing median over: stopped streams are partial.
    chargeHist: toHistogram(priced.filter((r) => !isIncomplete(r)).map((r) => r.chargeMicros), CHARGE_EDGES_MICROS),
    timedCount: timed.length,
    stageSums: { waitMs: wait.sum, genMs: gen.sum, overheadMs: overhead.sum, deliverMs: deliver.sum },
    stageCounts: { waitMs: wait.count, genMs: gen.count, overheadMs: overhead.count, deliverMs: deliver.count },
    notable: {
      slowest: slowestFirst(timed.map(notableRow)),
      costliest: costliestFirst(priced.map(notableRow)),
      failures: newestFirst(list.filter(isError).map(notableRow)),
    },
    modelCounts: Object.fromEntries([...groupBy(list, (r) => r.model)].map(([model, rows]) => [model, rows.length])),
    errorKinds: Object.fromEntries([...groupBy(list.filter(isError), (r) => r.errorKind || "unknown")].map(([kind, rows]) => [kind, rows.length])),
    pricedRequests: priced.length,
  };
}

function modelDay(list: PerformanceRow[]): ModelDay {
  const timed = list.filter(isTimed);
  return {
    requests: list.length,
    errors: list.filter(isError).length,
    fallbacks: list.filter((r) => r.fallback === true).length,
    totalDurationMs: sum(list, (r) => r.durationMs ?? 0),
    inputTokens: sum(list, (r) => r.inputTokens),
    outputTokens: sum(list, (r) => r.outputTokens),
    costMicros: sum(list.filter(isPriced), (r) => r.costMicros),
    durationHist: toHistogram(timed.map((r) => r.durationMs as number), DURATION_EDGES_MS),
    timedCount: timed.length,
  };
}

/** `uids` is parallel to `rows`, already shortened (or null) by the caller, so no full uid ever reaches here. */
export function buildDailyRollup(
  rows: PerformanceRow[], day: string, uids: (string | null)[], truncated: boolean,
): DailyRollup {
  if (uids.length !== rows.length) throw new Error(`Expected ${rows.length} uids, got ${uids.length}`);

  const features: Record<string, FeatureDay> = {};
  for (const [feature, list] of groupBy(rows, (r) => r.feature)) features[feature] = featureDay(list);
  const models: Record<string, ModelDay> = {};
  for (const [model, list] of groupBy(rows, (r) => r.model)) models[model] = modelDay(list);

  const students: Record<string, StudentDay> = {};
  rows.forEach((row, i) => {
    const shortUid = uids[i];
    if (shortUid === null) return;
    const student = students[shortUid] ?? { requests: 0, chargeMicros: 0 };
    student.requests++;
    // Same rows as a feature's charge, so the students add up to the features.
    if (isPriced(row)) student.chargeMicros += row.chargeMicros;
    students[shortUid] = student;
  });

  return { day, rowsRead: rows.length, truncated, features, models, students, money: null, unusedBalanceMicros: null };
}

function durationPercentiles(hist: number[]): OpenPercentiles & { p50Ms: number | null; p95Ms: number | null } {
  return {
    p50Ms: percentileFromHistogram(hist, DURATION_EDGES_MS, 0.5),
    p95Ms: percentileFromHistogram(hist, DURATION_EDGES_MS, 0.95),
    p50AboveMs: percentileAboveFromHistogram(hist, DURATION_EDGES_MS, 0.5),
    p95AboveMs: percentileAboveFromHistogram(hist, DURATION_EDGES_MS, 0.95),
  };
}

const dayStart = (day: string) => new Date(`${day}T00:00:00.000Z`).getTime();
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const mean = (total: number, count: number) => (count === 0 ? null : total / count);

function addStages(a: Stages, b: Stages): Stages {
  return { waitMs: a.waitMs + b.waitMs, genMs: a.genMs + b.genMs, overheadMs: a.overheadMs + b.overheadMs, deliverMs: a.deliverMs + b.deliverMs };
}

function mergeFeature(a: FeatureDay, b: FeatureDay): FeatureDay {
  return {
    requests: a.requests + b.requests, errors: a.errors + b.errors, localRequests: a.localRequests + b.localRequests,
    inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens,
    costMicros: a.costMicros + b.costMicros, chargeMicros: a.chargeMicros + b.chargeMicros,
    unknownCostRows: a.unknownCostRows + b.unknownCostRows,
    durationHist: mergeHistograms(a.durationHist, b.durationHist),
    chargeHist: mergeHistograms(a.chargeHist, b.chargeHist),
    timedCount: a.timedCount + b.timedCount,
    stageSums: addStages(a.stageSums, b.stageSums),
    stageCounts: addStages(a.stageCounts, b.stageCounts),
    notable: {
      slowest: slowestFirst([...a.notable.slowest, ...b.notable.slowest]),
      costliest: costliestFirst([...a.notable.costliest, ...b.notable.costliest]),
      failures: newestFirst([...a.notable.failures, ...b.notable.failures]),
    },
    modelCounts: addCounts(a.modelCounts, b.modelCounts),
    errorKinds: addCounts(a.errorKinds, b.errorKinds),
    // Unknown on either side leaves the sum unknown: a partial count would understate it.
    pricedRequests: a.pricedRequests === undefined || b.pricedRequests === undefined ? undefined : a.pricedRequests + b.pricedRequests,
  };
}

function addCounts(a: Record<string, number> = {}, b: Record<string, number> = {}): Record<string, number> {
  const out = { ...a };
  for (const [key, n] of Object.entries(b)) out[key] = (out[key] ?? 0) + n;
  return out;
}

function mergeModel(a: ModelDay, b: ModelDay): ModelDay {
  return {
    requests: a.requests + b.requests, errors: a.errors + b.errors, fallbacks: a.fallbacks + b.fallbacks,
    totalDurationMs: a.totalDurationMs + b.totalDurationMs,
    inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens, costMicros: a.costMicros + b.costMicros,
    durationHist: mergeHistograms(a.durationHist, b.durationHist),
    timedCount: a.timedCount + b.timedCount,
  };
}

function mergeMoney(a: MoneySummary, b: MoneySummary): MoneySummary {
  return {
    cashCollectedMicros: a.cashCollectedMicros + b.cashCollectedMicros,
    creditGrantedMicros: a.creditGrantedMicros + b.creditGrantedMicros,
    cashRefundedMicros: a.cashRefundedMicros + b.cashRefundedMicros,
    netCashMicros: a.netCashMicros + b.netCashMicros,
    trialGrantedMicros: a.trialGrantedMicros + b.trialGrantedMicros,
    creditRefundedMicros: a.creditRefundedMicros + b.creditRefundedMicros,
  };
}

function mergeRecords<T>(records: Record<string, T>[], merge: (a: T, b: T) => T): Map<string, T> {
  const out = new Map<string, T>();
  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      const seen = out.get(key);
      out.set(key, seen === undefined ? value : merge(seen, value));
    }
  }
  return out;
}

/** Median charge per request, per feature, from the days' charge histograms: the /billing figure, reported as a bucket's
 * upper edge. A feature under `minRequests`, or whose median falls in the open-topped bucket, is left out so its hardcoded estimate stays. */
export function medianChargeByFeature(days: DailyRollup[], minRequests = 20): Map<string, number> {
  const out = new Map<string, number>();
  const hists = days.map((d) => Object.fromEntries(Object.entries(d.features).map(([feature, f]) => [feature, f.chargeHist])));
  for (const [feature, hist] of mergeRecords(hists, mergeHistograms)) {
    if (hist.reduce((n, c) => n + c, 0) < minRequests) continue;
    const median = percentileFromHistogram(hist, CHARGE_EDGES_MICROS, 0.5);
    if (median !== null) out.set(feature, median);
  }
  return out;
}

export function mergeRollups(days: DailyRollup[]): MergedRollup {
  const sorted = [...days].sort((a, b) => a.day.localeCompare(b.day));

  const merged = [...mergeRecords(sorted.map((d) => d.features), mergeFeature)];
  const features = merged.map(([feature, f]) => ({
    feature,
    requests: f.requests,
    errors: f.errors,
    errorRate: f.requests === 0 ? 0 : f.errors / f.requests,
    localRequests: f.localRequests,
    ...durationPercentiles(f.durationHist),
    timedCount: f.timedCount,
    stages: Object.values(f.stageCounts).every((n) => n === 0) ? null : {
      waitMs: mean(f.stageSums.waitMs, f.stageCounts.waitMs),
      genMs: mean(f.stageSums.genMs, f.stageCounts.genMs),
      overheadMs: mean(f.stageSums.overheadMs, f.stageCounts.overheadMs),
      deliverMs: mean(f.stageSums.deliverMs, f.stageCounts.deliverMs),
    },
    inputTokens: f.inputTokens,
    outputTokens: f.outputTokens,
    costMicros: f.costMicros,
    notable: f.notable,
    modelCounts: { ...f.modelCounts },
  }));
  features.sort((a, b) => b.requests - a.requests);

  const total = merged.reduce(
    (t, [, f]) => ({
      requests: t.requests + f.requests,
      errors: t.errors + f.errors,
      inputTokens: t.inputTokens + f.inputTokens,
      outputTokens: t.outputTokens + f.outputTokens,
      costMicros: t.costMicros + f.costMicros,
      chargeMicros: t.chargeMicros + f.chargeMicros,
      unknownCostRows: t.unknownCostRows + f.unknownCostRows,
    }),
    { requests: 0, errors: 0, inputTokens: 0, outputTokens: 0, costMicros: 0, chargeMicros: 0, unknownCostRows: 0 },
  );

  const models: ModelStats[] = [...mergeRecords(sorted.map((d) => d.models), mergeModel)].map(([model, m]) => ({
    model,
    requests: m.requests,
    totalDurationMs: m.totalDurationMs,
    ...durationPercentiles(m.durationHist),
    inputTokens: m.inputTokens,
    outputTokens: m.outputTokens,
    costMicros: m.costMicros,
    fallbacks: m.fallbacks,
  }));
  models.sort((a, b) => b.requests - a.requests);

  const students: StudentStats[] = [...mergeRecords(sorted.map((d) => d.students), (a, b) => ({
    requests: a.requests + b.requests, chargeMicros: a.chargeMicros + b.chargeMicros,
  }))].map(([shortUid, s]) => ({ shortUid, ...s }));
  students.sort((a, b) => b.chargeMicros - a.chargeMicros || b.requests - a.requests);

  const missingDays: string[] = [];
  const present = new Set(sorted.map((d) => d.day));
  if (sorted.length > 0) {
    for (let ms = dayStart(sorted[0].day); ms <= dayStart(sorted[sorted.length - 1].day); ms += DAY_MS) {
      if (!present.has(dayKey(ms))) missingDays.push(dayKey(ms));
    }
  }

  const withMoney = sorted.map((d) => d.money).filter((m): m is MoneySummary => m !== null);
  const newestBalance = sorted.findLast((d) => d.unusedBalanceMicros !== null);

  return {
    since: sorted.length === 0 ? "" : new Date(dayStart(sorted[0].day)).toISOString(),
    until: sorted.length === 0 ? "" : new Date(dayStart(sorted[sorted.length - 1].day) + DAY_MS).toISOString(),
    truncated: sorted.some((d) => d.truncated),
    features, total, models, students, missingDays,
    money: withMoney.length === 0 ? null : withMoney.reduce(mergeMoney),
    unusedBalanceMicros: newestBalance?.unusedBalanceMicros ?? null,
    unusedBalanceAsOf: newestBalance?.day ?? null,
  };
}

/** `feature` over the given days, from the same day documents mergeRollups reads. */
export function featureDetail(days: DailyRollup[], feature: string): FeatureDetail {
  const sorted = [...days].sort((a, b) => a.day.localeCompare(b.day));
  const of = (d: DailyRollup) => (Object.hasOwn(d.features, feature) ? d.features[feature] : undefined);
  const present = sorted.flatMap((d) => of(d) ?? []);
  const merged = present.length === 0 ? null : present.reduce(mergeFeature);
  const hist = merged ? [...merged.durationHist] : DURATION_EDGES_MS.map(() => 0);
  return {
    feature,
    durationHist: hist,
    durationEdgesMs: DURATION_EDGES_MS.filter(Number.isFinite),
    ...durationPercentiles(hist),
    timedCount: merged?.timedCount ?? 0,
    requests: merged?.requests ?? 0,
    errors: merged?.errors ?? 0,
    errorKinds: { ...merged?.errorKinds },
    notable: merged?.notable ?? { slowest: [], costliest: [], failures: [] },
    days: sorted.map((d) => {
      const f = of(d);
      if (!f) return { day: d.day, requests: 0, costMicros: 0, pricedRequests: 0, maxCostMicros: null };
      // notable.costliest is drawn from the same priced rows as costMicros, costliest first.
      return { day: d.day, requests: f.requests, costMicros: f.costMicros, pricedRequests: f.pricedRequests ?? null, maxCostMicros: f.notable.costliest[0]?.costMicros ?? null };
    }),
  };
}
