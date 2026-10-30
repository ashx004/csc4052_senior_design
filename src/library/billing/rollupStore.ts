import "server-only";
// aiUsageDaily/{YYYY-MM-DD}: one rollup per UTC day, built nightly from raw aiUsage rows and the wallet ledgers,
// so the admin dashboard reads a handful of day documents instead of every request.
import { usageDocToRow } from "./aiPerformance";
import { buildDailyRollup, type DailyRollup, type FeatureDay, type ModelDay } from "./dailyRollup";
import { CHARGE_EDGES_MICROS, DURATION_EDGES_MS } from "./histogram";
import { summarizeLedger, type LedgerEntry, type MoneySummary } from "./moneySummary";

export const ROLLUP_COLLECTION = "aiUsageDaily";
/** Lower than the raw report's cap so one night's build cannot spend the whole 50,000-read daily quota. */
export const ROLLUP_MAX_ROWS = 20_000;
const DAY_MS = 86_400_000;

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** UTC "YYYY-MM-DD". */
export function dayKey(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** The `days` complete UTC days before `now`, newest first; today is still filling up, so it is left out. */
export function dayKeysBack(days: number, now: Date = new Date()): string[] {
  const today = Date.parse(`${dayKey(now)}T00:00:00.000Z`);
  return Array.from({ length: days }, (_, i) => dayKey(new Date(today - (i + 1) * DAY_MS)));
}

function dayRange(day: string): { start: Date; end: Date } {
  const start = new Date(`${day}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(start.getTime()) || dayKey(start) !== day) {
    throw new Error(`Not a UTC day key: ${day}`);
  }
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

const shortUid = (uid: unknown) => (typeof uid === "string" && uid.length > 0 ? `${uid.slice(0, 8)}…` : null);

const MONEY_TYPES = ["purchase", "refund", "dispute", "trial", "refund-ai"];

/** Reads: one per wallet, plus each wallet's money entries of all time (at least one read per wallet, for an empty result). */
async function walletMoney(start: Date, end: Date) {
  const { adminDb } = await import("../firebaseAdmin");
  const wallets = await adminDb.collection("wallets").select("balanceMicros").get();
  // Filtering on type keeps the per-request "charge" entries out of the read count. Adding an `at` range
  // to the query would need a composite index that cannot be deployed, so the day is filtered in code.
  const ledgers = await Promise.all(wallets.docs.map((wallet) =>
    adminDb.collection("wallets").doc(wallet.id).collection("ledger")
      .where("type", "in", MONEY_TYPES)
      .select("type", "amountMicros", "paidMicros", "at")
      .get()));
  const entries: LedgerEntry[] = ledgers.flatMap((ledger) => ledger.docs.flatMap((doc) => {
    const d = doc.data();
    const at: unknown = d.at?.toDate?.();
    if (!(at instanceof Date) || at < start || at >= end) return [];
    return [{
      type: typeof d.type === "string" ? d.type : "",
      amountMicros: num(d.amountMicros, 0),
      paidMicros: numOrNull(d.paidMicros),
      at,
    }];
  }));
  return {
    money: summarizeLedger(entries),
    unusedBalanceMicros: wallets.docs.reduce((total, wallet) => total + num(wallet.data().balanceMicros, 0), 0),
  };
}

/** Builds aiUsageDaily/{day} from that UTC day's aiUsage rows and wallet ledgers, overwriting any earlier build. */
export async function buildAndStoreDay(day: string): Promise<DailyRollup> {
  const { start, end } = dayRange(day);
  const { adminDb } = await import("../firebaseAdmin");
  const snap = await adminDb
    .collection("aiUsage")
    .where("at", ">=", start)
    .where("at", "<", end)
    // uid is read only to be shortened below; the full value goes no further than this function.
    .select("feature", "model", "status", "incomplete", "durationMs", "waitMs", "genMs", "overheadMs", "deliverMs", "inputTokens", "outputTokens", "costMicros", "chargeMicros", "costSource", "at", "fallback", "httpStatus", "errorKind", "uid")
    .limit(ROLLUP_MAX_ROWS)
    .get();
  const data = snap.docs.map((doc) => doc.data());
  const rollup: DailyRollup = {
    ...buildDailyRollup(data.map(usageDocToRow), day, data.map((d) => shortUid(d.uid)), snap.size >= ROLLUP_MAX_ROWS),
    ...(await walletMoney(start, end)),
  };
  // set(), not update(): model names contain dots, which update() would read as nested field paths.
  await adminDb.collection(ROLLUP_COLLECTION).doc(day).set(rollup);
  return rollup;
}

const isHist = (v: unknown, edges: readonly number[]) =>
  Array.isArray(v) && v.length === edges.length && v.every((n) => typeof n === "number" && Number.isFinite(n));

/** The parts a merge would throw on: histograms of the current bucket layout, and the containers it reads into. */
const isFeatureDay = (f: unknown): f is FeatureDay =>
  isRecord(f) && isHist(f.durationHist, DURATION_EDGES_MS) && isHist(f.chargeHist, CHARGE_EDGES_MICROS)
  && isRecord(f.stageSums) && isRecord(f.stageCounts)
  && isRecord(f.notable) && Array.isArray(f.notable.slowest) && Array.isArray(f.notable.costliest) && Array.isArray(f.notable.failures)
  && (f.modelCounts === undefined || isRecord(f.modelCounts)) && (f.errorKinds === undefined || isRecord(f.errorKinds));
const isModelDay = (m: unknown): m is ModelDay => isRecord(m) && isHist(m.durationHist, DURATION_EDGES_MS);

const MONEY_FIELDS: (keyof MoneySummary)[] = [
  "cashCollectedMicros", "creditGrantedMicros", "cashRefundedMicros", "netCashMicros", "trialGrantedMicros", "creditRefundedMicros",
];
const asMoney = (v: unknown): MoneySummary | null =>
  isRecord(v) && MONEY_FIELDS.every((field) => numOrNull(v[field]) !== null) ? (v as MoneySummary) : null;

function keepWhere<T>(record: Record<string, unknown>, ok: (v: unknown) => v is T): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter((entry): entry is [string, T] => ok(entry[1])));
}

/** A stored document as a rollup, or null when it is not one. An entry that would make every merge throw, such as a
 * histogram from an older bucket layout, is dropped rather than retried on every read. */
function asRollup(key: string, d: unknown): DailyRollup | null {
  if (!isRecord(d) || d.day !== key || typeof d.rowsRead !== "number" || typeof d.truncated !== "boolean") return null;
  if (!isRecord(d.features) || !isRecord(d.models) || !isRecord(d.students)) return null;
  return {
    ...(d as DailyRollup),
    features: keepWhere(d.features, isFeatureDay),
    models: keepWhere(d.models, isModelDay),
    money: asMoney(d.money),
    unusedBalanceMicros: numOrNull(d.unusedBalanceMicros),
  };
}

export const SNAPSHOT_KEY = "ai-reports/latest.json";

/** Same check as the storage probe: without both, there is no bucket to use. */
const gcsConfigured = () => Boolean(process.env.GCS_BUCKET && process.env.GCS_SERVICE_ACCOUNT_JSON);

/** Copies the day documents to GCS, which keeps working when Firestore's daily read quota is spent. False when GCS is unconfigured or the upload fails. */
export async function writeSnapshot(rollups: DailyRollup[]): Promise<boolean> {
  if (!gcsConfigured()) return false;
  try {
    const { putObject } = await import("../gcsStorage");
    await putObject(SNAPSHOT_KEY, JSON.stringify({ builtAt: new Date().toISOString(), rollups }), "application/json");
    return true;
  } catch (e) {
    console.error("AI report snapshot write failed:", e);
    return false;
  }
}

/** The last snapshot's day documents, or null when GCS is unconfigured, nothing was written, or it cannot be read. Never throws. */
export async function readSnapshot(): Promise<{ rollups: DailyRollup[]; builtAt: Date } | null> {
  if (!gcsConfigured()) return null;
  try {
    const { getObject, headObject } = await import("../gcsStorage");
    if (!(await headObject(SNAPSHOT_KEY))) return null;
    const parsed: unknown = JSON.parse((await getObject(SNAPSHOT_KEY)).body.toString("utf8"));
    if (!isRecord(parsed) || typeof parsed.builtAt !== "string" || !Array.isArray(parsed.rollups)) return null;
    const builtAt = new Date(parsed.builtAt);
    if (Number.isNaN(builtAt.getTime())) return null;
    const rollups = parsed.rollups.flatMap((d: unknown) => {
      const rollup = isRecord(d) && typeof d.day === "string" ? asRollup(d.day, d) : null;
      return rollup ? [rollup] : [];
    });
    return { rollups, builtAt };
  } catch (e) {
    console.error("AI report snapshot read failed:", e);
    return null;
  }
}

/** One batched read (one read per key). Rollups come back in the order of `keys`; a key with no usable document is missing. */
export async function readDays(keys: string[]): Promise<{ rollups: DailyRollup[]; missing: string[] }> {
  if (keys.length === 0) return { rollups: [], missing: [] };
  const { adminDb } = await import("../firebaseAdmin");
  const snaps = await adminDb.getAll(...keys.map((key) => adminDb.collection(ROLLUP_COLLECTION).doc(key)));
  const rollups: DailyRollup[] = [], missing: string[] = [];
  snaps.forEach((snap, i) => {
    const rollup = snap.exists ? asRollup(keys[i], snap.data()) : null;
    if (rollup) rollups.push(rollup);
    else missing.push(keys[i]);
  });
  return { rollups, missing };
}
