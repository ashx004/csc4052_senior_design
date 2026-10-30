import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const gcs = vi.hoisted(() => ({
  objects: new Map<string, { body: Buffer; contentType: string | null }>(),
  put: vi.fn(), get: vi.fn(), head: vi.fn(),
}));
vi.mock("../gcsStorage", () => ({ putObject: gcs.put, getObject: gcs.get, headObject: gcs.head }));
vi.mock("../firebaseAdmin", () => ({ adminDb: {} }));
import { SNAPSHOT_KEY, readSnapshot, writeSnapshot } from "./rollupStore";
import { buildDailyRollup, type DailyRollup } from "./dailyRollup";
import { summarizeLedger } from "./moneySummary";

const ENV = ["GCS_BUCKET", "GCS_SERVICE_ACCOUNT_JSON"] as const;
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));

const day = (key: string): DailyRollup => ({
  ...buildDailyRollup([{
    feature: "chat", model: "openrouter:a/b.c", status: "ok", durationMs: 900, waitMs: 100, genMs: 700, overheadMs: 50, deliverMs: 50,
    inputTokens: 10, outputTokens: 20, costMicros: 100, chargeMicros: 106, costSource: "provider", at: new Date(`${key}T10:00:00Z`),
  }], key, ["a1b2c3d4…"], false),
  money: summarizeLedger([{ type: "purchase", amountMicros: 5_000_000, paidMicros: 5_000_000, at: new Date(`${key}T11:00:00Z`) }]),
  unusedBalanceMicros: 1_234,
});
const store = (json: string) => gcs.objects.set(SNAPSHOT_KEY, { body: Buffer.from(json), contentType: "application/json" });

beforeEach(() => {
  process.env.GCS_BUCKET = "bucket";
  process.env.GCS_SERVICE_ACCOUNT_JSON = "{}";
  gcs.objects.clear();
  gcs.put.mockReset().mockImplementation(async (key: string, body: string, contentType?: string) => {
    gcs.objects.set(key, { body: Buffer.from(body), contentType: contentType ?? null });
  });
  gcs.get.mockReset().mockImplementation(async (key: string) => {
    const obj = gcs.objects.get(key);
    if (!obj) throw new Error("No such object");
    return obj;
  });
  gcs.head.mockReset().mockImplementation(async (key: string) =>
    gcs.objects.has(key) ? { key, size: gcs.objects.get(key)!.body.length, lastModified: null, etag: null } : null);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

it("uses the agreed object key", () => {
  expect(SNAPSHOT_KEY).toBe("ai-reports/latest.json");
});

it("writeSnapshot returns false and writes nothing when GCS is unconfigured", async () => {
  delete process.env.GCS_BUCKET;
  expect(await writeSnapshot([day("2026-10-29")])).toBe(false);
  process.env.GCS_BUCKET = "bucket";
  delete process.env.GCS_SERVICE_ACCOUNT_JSON;
  expect(await writeSnapshot([day("2026-10-29")])).toBe(false);
  expect(gcs.put).not.toHaveBeenCalled();
});

it("readSnapshot returns null without touching GCS when it is unconfigured", async () => {
  store(JSON.stringify({ builtAt: "2026-10-30T01:00:00.000Z", rollups: [day("2026-10-29")] }));
  delete process.env.GCS_SERVICE_ACCOUNT_JSON;
  expect(await readSnapshot()).toBeNull();
  expect(gcs.head).not.toHaveBeenCalled();
  expect(gcs.get).not.toHaveBeenCalled();
});

it("writes the day documents as JSON and reads them back with the build time", async () => {
  const rollups = [day("2026-10-29"), day("2026-10-28")];
  const before = Date.now();
  expect(await writeSnapshot(rollups)).toBe(true);

  expect(gcs.put).toHaveBeenCalledTimes(1);
  const [key, body, contentType] = gcs.put.mock.calls[0];
  expect(key).toBe(SNAPSHOT_KEY);
  expect(contentType).toBe("application/json");
  const parsed = JSON.parse(body as string);
  expect(parsed.rollups).toEqual(rollups);
  expect(Date.parse(parsed.builtAt)).toBeGreaterThanOrEqual(before);

  const read = await readSnapshot();
  expect(read!.rollups).toEqual(rollups);
  expect(read!.builtAt).toEqual(new Date(parsed.builtAt));
});

it("writeSnapshot reports a failed upload as false instead of throwing", async () => {
  gcs.put.mockRejectedValue(new Error("403 forbidden"));
  expect(await writeSnapshot([day("2026-10-29")])).toBe(false);
  expect(console.error).toHaveBeenCalled();
});

it("readSnapshot returns null when no snapshot has been written", async () => {
  expect(await readSnapshot()).toBeNull();
  expect(gcs.get).not.toHaveBeenCalled();
});

it("readSnapshot returns null for an unreadable or misshapen object", async () => {
  for (const json of [
    "not json",
    "[]",
    JSON.stringify({ rollups: [day("2026-10-29")] }), // no builtAt
    JSON.stringify({ builtAt: "yesterday", rollups: [day("2026-10-29")] }),
    JSON.stringify({ builtAt: "2026-10-30T01:00:00.000Z", rollups: "nope" }),
  ]) {
    store(json);
    expect(await readSnapshot(), json).toBeNull();
  }
});

it("readSnapshot returns null when GCS fails", async () => {
  store(JSON.stringify({ builtAt: "2026-10-30T01:00:00.000Z", rollups: [] }));
  gcs.get.mockRejectedValue(new Error("503"));
  expect(await readSnapshot()).toBeNull();
  gcs.head.mockRejectedValue(new Error("503"));
  expect(await readSnapshot()).toBeNull();
});

it("readSnapshot drops a malformed day instead of failing the whole snapshot", async () => {
  store(JSON.stringify({
    builtAt: "2026-10-30T01:00:00.000Z",
    rollups: [day("2026-10-29"), { day: "2026-10-28", rowsRead: 3 }, null, "x", day("2026-10-27")],
  }));
  const read = await readSnapshot();
  expect(read!.rollups.map((r) => r.day)).toEqual(["2026-10-29", "2026-10-27"]);
});
