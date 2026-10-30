/**
 * Dry-run billing report: what the logged AI usage says students would have
 * been charged, next to what OpenRouter says it actually billed.
 *
 *   npm run billing:report                # last 7 days
 *   npm run billing:report -- --days 2
 *   npm run billing:report -- --resolve   # also look up the real cost of stopped streams
 *
 * Compare "OpenRouter, logged" per UTC day with the dashboard's Activity page
 * (or the key's usage below). They should match to within a cent or so. The
 * key's own usage includes anything else run on that key, such as benchmarks,
 * so use a key that only the site uses.
 */
import "./loadEnvironment";
import { summarizeUsage, type Tally, type UsageRow } from "../src/library/billing/usageSummary";

const args = process.argv.slice(2);
const days = Number(args[args.indexOf("--days") + 1]) || 7;
const resolve = args.includes("--resolve");

const usd = (micros: number) => `$${(micros / 1e6).toFixed(6)}`;

function table(title: string, map: Map<string, Tally>, label = (k: string) => k) {
  console.log(`\n${title}`);
  if (!map.size) return console.log("  (none)");
  const rows = [...map.entries()].sort((a, b) => b[1].costMicros - a[1].costMicros);
  for (const [key, t] of rows) {
    console.log(`  ${label(key).padEnd(48)} ${String(t.requests).padStart(6)} req  ${String(t.inputTokens).padStart(10)} in  ${String(t.outputTokens).padStart(9)} out  ${usd(t.costMicros).padStart(10)}`);
  }
}

async function openRouter(path: string) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  const res = await fetch(`https://openrouter.ai/api/v1${path}`, { headers: { Authorization: `Bearer ${key}` } });
  return res.ok ? ((await res.json()) as { data?: Record<string, unknown> }).data ?? null : null;
}

async function main() {
  const { adminDb } = await import("../src/library/firebaseAdmin");
  const since = new Date(Date.now() - days * 86_400_000);
  const snap = await adminDb.collection("aiUsage").where("at", ">=", since).orderBy("at").get();
  const rows: (UsageRow & { id: string })[] = snap.docs.filter((doc) => doc.data().status !== "error").map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      uid: d.uid ?? null,
      feature: String(d.feature),
      model: String(d.model),
      inputTokens: Number(d.inputTokens ?? 0),
      outputTokens: Number(d.outputTokens ?? 0),
      costMicros: Number(d.costMicros ?? 0),
      costSource: String(d.costSource),
      requestId: d.requestId ?? null,
      incomplete: d.status === "incomplete" || Boolean(d.incomplete), // rows before the status field carry the old boolean
      at: d.at?.toDate?.() ?? new Date(0),
    };
  });

  if (resolve) {
    // OpenRouter keeps each generation's final cost, even for a stream the student stopped.
    for (const row of rows.filter((r) => r.incomplete && r.requestId && r.model.startsWith("openrouter:"))) {
      const gen = await openRouter(`/generation?id=${encodeURIComponent(row.requestId!)}`);
      if (typeof gen?.total_cost !== "number") continue;
      row.costMicros = Math.ceil(gen.total_cost * 1e6);
      // native_* are the counts the model host billed; tokens_* are OpenRouter's normalized estimate.
      row.inputTokens = Number(gen.native_tokens_prompt ?? row.inputTokens);
      row.outputTokens = Number(gen.native_tokens_completion ?? row.outputTokens);
      row.costSource = "provider-lookup";
      row.incomplete = false;
      await adminDb.collection("aiUsage").doc(row.id).update({ costMicros: row.costMicros, inputTokens: row.inputTokens, outputTokens: row.outputTokens, costSource: row.costSource, status: "ok", incomplete: false, resolvedAt: new Date() });
    }
  }

  const s = summarizeUsage(rows);
  console.log(`AI usage since ${since.toISOString()} (${days} days): ${s.total.requests} requests, ${usd(s.total.costMicros)} would have been charged.`);
  table("By provider and UTC day (compare with the provider dashboards)", s.byProviderDay);
  table("By model", s.byModel);
  table("By feature", s.byFeature);
  // Shortened uids: enough to tell students apart, not to identify them in a pasted report.
  table("By student", s.byUser, (uid) => `${uid.slice(0, 8)}…`);
  table("Unattributed, by feature (each one is a route missing enterAiUser)", s.unattributed);
  if (s.needsCost.length) {
    console.log(`\n${s.needsCost.length} request(s) have no final cost yet (stopped streams or unpriced models).${resolve ? "" : " Run with --resolve to look up OpenRouter's."}`);
  }

  // Money check: the credit students hold must be covered by what OpenRouter holds.
  const wallets = await adminDb.collection("wallets").get();
  const owedMicros = wallets.docs.reduce((sum, d) => sum + Math.max(0, Number(d.data().balanceMicros ?? 0)), 0);
  const credits = await openRouter("/credits");
  const remaining = credits ? Number(credits.total_credits ?? 0) - Number(credits.total_usage ?? 0) : null;
  console.log(`\nStudents are owed ${usd(owedMicros)} of unspent credit across ${wallets.size} wallet(s).`);
  if (remaining !== null) {
    console.log(`OpenRouter holds $${remaining.toFixed(4)}.${remaining * 1e6 < owedMicros ? " TOP UP OPENROUTER: it can't cover what students hold." : ""}`);
  }

  const key = await openRouter("/key");
  if (key) {
    console.log("\nOpenRouter key usage (all traffic on this key, in USD):");
    for (const field of ["usage_daily", "usage_weekly", "usage_monthly", "usage"]) {
      if (typeof key[field] === "number") console.log(`  ${field.padEnd(14)} $${(key[field] as number).toFixed(4)}`);
    }
  }
}

main().then(() => process.exit(0), (error) => {
  console.error(error);
  process.exit(1);
});
