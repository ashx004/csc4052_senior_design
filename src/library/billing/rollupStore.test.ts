import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

// Each chained call returns a NEW query object carrying the ops so far, so a where/limit assertion
// can only pass if the code really called it on the query that was executed.
type Op = [string, ...unknown[]];
type Snap = { size: number; docs: { id: string; data: () => Record<string, unknown> }[] };
const fake = vi.hoisted(() => ({
  results: new Map<string, unknown>(),
  stored: new Map<string, Record<string, unknown>>(),
  gets: [] as { path: string; ops: unknown[][] }[],
  sets: [] as { path: string; data: unknown }[],
  getAlls: [] as string[][],
}));
vi.mock("../firebaseAdmin", () => {
  // Firestore's serializer refuses an empty map key or one shaped like __name__ (reserved).
  const checkKeys = (v: unknown, at: string) => {
    if (typeof v !== "object" || v === null || Array.isArray(v) || v instanceof Date) return;
    for (const [key, child] of Object.entries(v)) {
      if (key === "" || /^__.*__$/.test(key)) throw new Error(`Invalid field path at ${at}: "${key}"`);
      checkKeys(child, `${at}.${key}`);
    }
  };
  const query = (path: string, ops: unknown[][] = []): Record<string, unknown> => ({
    where: (...a: unknown[]) => query(path, [...ops, ["where", ...a]]),
    select: (...a: unknown[]) => query(path, [...ops, ["select", ...a]]),
    orderBy: (...a: unknown[]) => query(path, [...ops, ["orderBy", ...a]]),
    limit: (...a: unknown[]) => query(path, [...ops, ["limit", ...a]]),
    get: async () => {
      fake.gets.push({ path, ops });
      return fake.results.get(path) ?? { size: 0, docs: [] };
    },
    doc: (id: string) => ({
      path: `${path}/${id}`,
      collection: (sub: string) => query(`${path}/${id}/${sub}`),
      set: async (data: unknown) => { checkKeys(data, "<root>"); fake.sets.push({ path: `${path}/${id}`, data }); },
    }),
  });
  return {
    adminDb: {
      collection: (name: string) => query(name),
      getAll: async (...refs: { path: string }[]) => {
        fake.getAlls.push(refs.map((r) => r.path));
        return refs.map((r) => ({ exists: fake.stored.has(r.path), data: () => fake.stored.get(r.path) }));
      },
    },
  };
});
import { ROLLUP_COLLECTION, ROLLUP_MAX_ROWS, buildAndStoreDay, dayKey, dayKeysBack, readDays } from "./rollupStore";
import { buildDailyRollup, featureDetail, medianChargeByFeature, mergeRollups, type DailyRollup } from "./dailyRollup";
import { summarizeLedger } from "./moneySummary";
import type { PerformanceRow } from "./aiPerformance";

const ts = (iso: string) => ({ toDate: () => new Date(iso) });
const snap = (rows: Record<string, unknown>[], size = rows.length): Snap => ({
  size, docs: rows.map((data, i) => ({ id: `d${i}`, data: () => data })),
});
const usage = (over: Record<string, unknown> = {}) => ({
  feature: "chat", model: "openrouter:anthropic/claude-3.5-sonnet", status: "ok", durationMs: 1200,
  waitMs: 100, genMs: 1000, overheadMs: 50, deliverMs: 50, inputTokens: 10, outputTokens: 20,
  costMicros: 100, chargeMicros: 106, costSource: "provider", at: ts("2026-10-29T10:00:00Z"), ...over,
});
const written = () => fake.sets[fake.sets.length - 1];
const opsFor = (path: string) => fake.gets.find((g) => g.path === path)?.ops;
const hasUndefined = (v: unknown): boolean =>
  v === undefined || (typeof v === "object" && v !== null && Object.values(v).some(hasUndefined));

beforeEach(() => {
  fake.results.clear(); fake.stored.clear();
  fake.gets.length = 0; fake.sets.length = 0; fake.getAlls.length = 0;
});

it("dayKey buckets by UTC, not local time", () => {
  expect(dayKey(new Date("2026-10-30T02:30:00Z"))).toBe("2026-10-30");
  expect(dayKey(new Date("2026-10-30T23:59:59Z"))).toBe("2026-10-30");
});

it("dayKeysBack excludes today and returns complete days only", () => {
  expect(dayKeysBack(3, new Date("2026-10-30T12:00:00Z"))).toEqual(["2026-10-29", "2026-10-28", "2026-10-27"]);
  // Just after UTC midnight, the day that only just began is still excluded.
  expect(dayKeysBack(1, new Date("2026-10-30T00:00:00Z"))).toEqual(["2026-10-29"]);
  expect(dayKeysBack(2, new Date("2026-03-01T05:00:00Z"))).toEqual(["2026-02-28", "2026-02-27"]);
});

it("buildAndStoreDay queries only that UTC day and caps the read", async () => {
  fake.results.set("wallets", snap([{ balanceMicros: 0 }]));
  await buildAndStoreDay("2026-10-29");

  const ops = opsFor("aiUsage")!;
  expect(ops).toContainEqual(["where", "at", ">=", new Date("2026-10-29T00:00:00.000Z")]);
  expect(ops).toContainEqual(["where", "at", "<", new Date("2026-10-30T00:00:00.000Z")]);
  expect(ops).toContainEqual(["limit", ROLLUP_MAX_ROWS]);
  expect(ROLLUP_MAX_ROWS).toBe(20_000);
  const select = ops.find((op) => op[0] === "select")!;
  expect(select).toEqual(expect.arrayContaining(["fallback", "httpStatus", "errorKind", "uid", "chargeMicros", "costSource", "at"]));

  // The ledger walk reads only money entries from each wallet's own subcollection, not a collection group,
  // and puts no `at` range in the query (that plus `in` would need a composite index).
  const ledger = opsFor("wallets/d0/ledger")!;
  expect(ledger.filter((op) => op[0] === "where")).toEqual([["where", "type", "in", ["purchase", "refund", "dispute", "trial", "refund-ai"]]]);
  expect(written().path).toBe(`${ROLLUP_COLLECTION}/2026-10-29`);
});

it("buildAndStoreDay never writes a full uid", async () => {
  fake.results.set("aiUsage", snap([usage({ uid: "a1b2c3d4e5f6" }), usage({ uid: "a1b2c3d4e5f6" }), usage({})]));
  const rollup = await buildAndStoreDay("2026-10-29");

  const data = written().data as DailyRollup;
  expect(Object.keys(data.students)).toEqual(["a1b2c3d4…"]);
  expect(data.students["a1b2c3d4…"]).toEqual({ requests: 2, chargeMicros: 212 });
  expect(JSON.stringify(data)).not.toContain("a1b2c3d4e5f6");
  expect(rollup).toEqual(data);
});

it("stores the day's money from every wallet's ledger and the summed balances", async () => {
  fake.results.set("wallets", snap([{ balanceMicros: 3_000_000 }, { balanceMicros: 4_500_000 }, {}]));
  const w0 = [
    { type: "purchase", amountMicros: 10_000_000, paidMicros: 10_000_000, at: ts("2026-10-29T00:00:00Z") },
  ];
  const w1 = [
    { type: "trial", amountMicros: 1_000_000, at: ts("2026-10-29T02:00:00Z") },
    { type: "refund-ai", amountMicros: 250, at: ts("2026-10-29T03:00:00Z") },
    { type: "refund", amountMicros: -9_410_000, at: ts("2026-10-29T23:59:59.999Z") },
  ];
  // The query has no day range, so entries from other days come back and must be dropped in code.
  const otherDays = [
    { type: "purchase", amountMicros: 5_000_000, paidMicros: 5_000_000, at: ts("2026-10-28T23:59:59.999Z") },
    { type: "trial", amountMicros: 2_000_000, at: ts("2026-10-30T00:00:00Z") },
    { type: "purchase", amountMicros: 7_000_000, paidMicros: 7_000_000 }, // no timestamp
  ];
  fake.results.set("wallets/d0/ledger", snap([...w0, ...otherDays]));
  fake.results.set("wallets/d1/ledger", snap(w1));

  await buildAndStoreDay("2026-10-29");
  const data = written().data as DailyRollup;
  const asEntries = (list: typeof w0 | typeof w1) => list.map((e) => ({ ...e, at: e.at.toDate() }));
  expect(data.money).toEqual(summarizeLedger([...asEntries(w0), ...asEntries(w1)]));
  expect(data.money).toMatchObject({ creditGrantedMicros: 10_000_000, netCashMicros: 590_000 });
  expect(data.money).toMatchObject({ cashCollectedMicros: 10_000_000, cashRefundedMicros: 9_410_000, trialGrantedMicros: 1_000_000, creditRefundedMicros: 250 });
  expect(data.unusedBalanceMicros).toBe(7_500_000);
  expect(fake.gets.map((g) => g.path).sort()).toEqual(["aiUsage", "wallets", "wallets/d0/ledger", "wallets/d1/ledger", "wallets/d2/ledger"]);
});

it("writes model names with dots and colons as whole keys, with nothing undefined", async () => {
  fake.results.set("aiUsage", snap([
    usage({ uid: "u1234567890" }),
    usage({ model: "ollama:llama3.1", costMicros: 0, chargeMicros: 0, costSource: "unknown" }),
    { at: ts("2026-10-29T11:00:00Z") }, // a bare legacy row
    usage({ feature: "", model: "" }), // empty names would be empty map keys, which set() rejects
  ]));
  await buildAndStoreDay("2026-10-29");
  const data = written().data as DailyRollup;
  expect(Object.keys(data.models).sort()).toEqual(["ollama:llama3.1", "openrouter:anthropic/claude-3.5-sonnet", "unknown"]);
  expect(data.models.unknown.requests).toBe(2);
  expect(Object.keys(data.features).sort()).toEqual(["chat", "unknown"]);
  expect(data.features.unknown.requests).toBe(2);
  expect(hasUndefined(data)).toBe(false);
  expect(data.money).toEqual(summarizeLedger([]));
  expect(data.unusedBalanceMicros).toBe(0);
});

it("the test store rejects the keys Firestore rejects", async () => {
  const { adminDb } = await import("../firebaseAdmin");
  const ref = adminDb.collection(ROLLUP_COLLECTION).doc("x");
  await expect(ref.set({ models: { "": {} } })).rejects.toThrow(/Invalid field path/);
  await expect(ref.set({ models: { a: { __name__: 1 } } })).rejects.toThrow(/Invalid field path/);
  await expect(ref.set({ models: { "openrouter:a/b.c": { n: 1 } } })).resolves.toBeUndefined();
});

it("carries fallback, httpStatus and errorKind into the rollup", async () => {
  fake.results.set("aiUsage", snap([
    usage({ status: "error", fallback: true, httpStatus: 429, errorKind: "rate-limit", costSource: "unknown", costMicros: 0, chargeMicros: 0 }),
    usage({ fallback: "yes", httpStatus: "500", errorKind: 7 }),
  ]));
  await buildAndStoreDay("2026-10-29");
  const data = written().data as DailyRollup;
  const model = data.models["openrouter:anthropic/claude-3.5-sonnet"];
  expect(model.fallbacks).toBe(1);
  expect(data.features.chat.notable.failures).toEqual([expect.objectContaining({ httpStatus: 429, errorKind: "rate-limit" })]);
  expect(data.features.chat.notable.slowest.every((r) => r.httpStatus === null && r.errorKind === null)).toBe(true);
});

it("matches buildDailyRollup on the same rows and flags a day that hit the cap", async () => {
  const rows = [usage({ uid: "abcdefghijk" }), usage({ feature: "hint", status: "incomplete", durationMs: null })];
  fake.results.set("aiUsage", snap(rows, ROLLUP_MAX_ROWS));
  const rollup = await buildAndStoreDay("2026-10-29");
  expect(rollup.truncated).toBe(true);
  expect(rollup.rowsRead).toBe(2);
  const expected = buildDailyRollup(
    rows.map((r) => ({ ...r, at: r.at.toDate(), fallback: false, httpStatus: null, errorKind: null })) as never,
    "2026-10-29", ["abcdefgh…", null], true,
  );
  expect({ ...rollup, money: null, unusedBalanceMicros: null }).toEqual(expected);
});

it("buildAndStoreDay rejects a key that is not a UTC day", async () => {
  await expect(buildAndStoreDay("2026-13-40")).rejects.toThrow();
  await expect(buildAndStoreDay("yesterday")).rejects.toThrow();
  expect(fake.gets).toEqual([]);
  expect(fake.sets).toEqual([]);
});

const usageRow = (over: Partial<PerformanceRow> = {}): PerformanceRow => ({
  feature: "chat", model: "openrouter:a", status: "ok", durationMs: 1200, waitMs: null, genMs: null, overheadMs: 0, deliverMs: null,
  inputTokens: 10, outputTokens: 20, costMicros: 100, chargeMicros: 106, costSource: "provider", at: new Date("2026-10-28T10:00:00Z"), ...over,
});

const storedDay = (day: string): DailyRollup => ({
  ...buildDailyRollup([], day, [], false), money: summarizeLedger([]), unusedBalanceMicros: 0,
});

it("readDays reports keys that have no document", async () => {
  fake.stored.set(`${ROLLUP_COLLECTION}/2026-10-29`, storedDay("2026-10-29"));
  fake.stored.set(`${ROLLUP_COLLECTION}/2026-10-27`, storedDay("2026-10-27"));
  const { rollups, missing } = await readDays(["2026-10-29", "2026-10-28", "2026-10-27"]);
  expect(rollups.map((r) => r.day)).toEqual(["2026-10-29", "2026-10-27"]);
  expect(rollups[0]).toEqual(storedDay("2026-10-29"));
  expect(missing).toEqual(["2026-10-28"]);
  // One batched read for the whole window.
  expect(fake.getAlls).toEqual([[`${ROLLUP_COLLECTION}/2026-10-29`, `${ROLLUP_COLLECTION}/2026-10-28`, `${ROLLUP_COLLECTION}/2026-10-27`]]);
});

it("readDays counts a malformed document as missing instead of crashing", async () => {
  fake.stored.set(`${ROLLUP_COLLECTION}/2026-10-29`, { day: "2026-10-29", rowsRead: 3 });
  fake.stored.set(`${ROLLUP_COLLECTION}/2026-10-28`, { ...storedDay("2026-10-27") });
  fake.stored.set(`${ROLLUP_COLLECTION}/2026-10-27`, storedDay("2026-10-27"));
  const { rollups, missing } = await readDays(["2026-10-29", "2026-10-28", "2026-10-27"]);
  expect(rollups.map((r) => r.day)).toEqual(["2026-10-27"]);
  expect(missing).toEqual(["2026-10-29", "2026-10-28"]);
});

it("readDays drops feature and model entries whose histograms would break a merge, and money that is not all numbers", async () => {
  const good = storedDay("2026-10-29");
  const built = buildDailyRollup([usageRow(), usageRow({ feature: "quiz", model: "openrouter:b" })], "2026-10-28", [null, null], false);
  const { chat, quiz } = built.features;
  const { "openrouter:a": modelA, "openrouter:b": modelB } = built.models;
  fake.stored.set(`${ROLLUP_COLLECTION}/2026-10-29`, { ...good, features: { chat }, models: { "openrouter:a": modelA } });
  fake.stored.set(`${ROLLUP_COLLECTION}/2026-10-28`, {
    ...built,
    features: {
      chat,
      quiz: { ...quiz, durationHist: quiz.durationHist.slice(1) }, // an older bucket layout
      "no-hist": { ...quiz, chargeHist: undefined },
      "bad-count": { ...quiz, durationHist: quiz.durationHist.map((n, i) => (i === 0 ? "1" : n)) },
      "not-an-object": 7,
    },
    models: { "openrouter:a": modelA, "openrouter:b": { ...modelB, durationHist: null } },
    money: { ...summarizeLedger([]), netCashMicros: "12" },
  });
  const { rollups, missing } = await readDays(["2026-10-29", "2026-10-28"]);
  expect(missing).toEqual([]);
  const old = rollups[1];
  expect(Object.keys(old.features)).toEqual(["chat"]);
  expect(Object.keys(old.models)).toEqual(["openrouter:a"]);
  expect(old.money).toBeNull();
  expect(rollups[0].money).toEqual(summarizeLedger([]));

  // Nothing downstream throws, so the /billing cache is not stuck retrying every minute.
  const merged = mergeRollups(rollups);
  expect(merged.features.map((f) => f.feature)).toEqual(["chat"]);
  expect(merged.features[0].requests).toBe(2);
  expect(() => medianChargeByFeature(rollups)).not.toThrow();
  expect(() => featureDetail(rollups, "quiz")).not.toThrow();
});

it("readDays with no keys reads nothing", async () => {
  expect(await readDays([])).toEqual({ rollups: [], missing: [] });
  expect(fake.getAlls).toEqual([]);
});
