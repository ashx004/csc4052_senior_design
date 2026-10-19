import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { adminDb } from "@/src/library/firebaseAdmin";
import type { Meter, MeterSession, UsageEvent } from "@/src/library/ai/aiFetch";
import { chargeForCost } from "./pricing";
import { InsufficientCreditError, chargeDirect, getWallet, releaseCredit, reserveCredit, settleCredit } from "./wallet";

// Meters every cloud AI request.
//
// BILLING_MODE:
//   enforce  the paywall. Before a request runs, its worst-case cost is held
//            from the student's wallet (no credit: the request is refused).
//            When it finishes, the provider's reported cost plus its fee is
//            charged and the rest of the hold released.
//   log      dry run: every request is recorded in aiUsage with what it would
//            have cost; no balance is touched, nobody is blocked.
//   off      nothing is recorded.
// Every request is also written to aiUsage (server-only: the catch-all rule
// in firestore.rules denies clients), which scripts/usageReport.ts compares
// with the provider dashboards.

export type BillingMode = "off" | "log" | "enforce";

// Many tiny calls in a burst (one per document chunk): checked and charged
// without a hold, see chargeDirect in wallet.ts.
const BULK_FEATURES = new Set(["contextual-chunking"]);

export function billingMode(): BillingMode {
  const mode = process.env.BILLING_MODE;
  return mode === "off" || mode === "enforce" ? mode : "log";
}

/** A cloud request with no student to charge. In enforce mode it is refused rather than given away. */
export class UnattributedAiError extends Error {
  constructor(feature: string) {
    super(`AI request for ${feature} has no account to charge.`);
    this.name = "UnattributedAiError";
  }
}

export function usageRecord(event: UsageEvent, chargeMicros: number, charged: boolean) {
  return {
    uid: event.uid ?? null,
    feature: event.feature,
    model: event.model,
    inputTokens: event.inputTokens,
    outputTokens: event.outputTokens,
    costMicros: event.costMicros,
    chargeMicros,
    costSource: event.costSource,
    rateId: event.rateId ?? null,
    requestId: event.requestId ?? null,
    fallback: event.fallback,
    incomplete: event.incomplete ?? false,
    charged,
  };
}

// A stream the student stopped never got its usage line, but OpenRouter
// still billed the words written. Its generation record has the final cost
// a moment later.
async function lookUpOpenRouterCost(requestId: string): Promise<{ costMicros: number; inputTokens: number; outputTokens: number } | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  for (const delayMs of [2000, 5000, 15000]) {
    await new Promise((r) => setTimeout(r, delayMs));
    try {
      const res = await fetch(`https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(requestId)}`, { headers: { Authorization: `Bearer ${key}` } });
      if (!res.ok) continue;
      const data = ((await res.json()) as { data?: Record<string, unknown> }).data;
      if (typeof data?.total_cost !== "number") continue;
      return { costMicros: Math.ceil(data.total_cost * 1e6), inputTokens: Number(data.native_tokens_prompt ?? 0), outputTokens: Number(data.native_tokens_completion ?? 0) };
    } catch {
      // try again after the next delay
    }
  }
  return null;
}

/** Fills in the real cost of a request whose stream ended early, when the provider can tell us. */
async function resolveCost(event: UsageEvent): Promise<UsageEvent & { known: boolean }> {
  if (!event.incomplete && event.costSource !== "unknown") return { ...event, known: true };
  if (event.requestId && event.model.startsWith("openrouter:")) {
    const found = await lookUpOpenRouterCost(event.requestId);
    if (found) return { ...event, ...found, costSource: "provider", incomplete: false, known: true };
  }
  return { ...event, known: false };
}

function logLine(event: UsageEvent) {
  console.info(`[ai-usage] ${JSON.stringify(event)}`);
  // Loud, so a route missing enterAiUser() is found in the dry run, not by students.
  if (!event.uid) console.warn(`[ai-usage] unattributed ${event.feature} request: its route never called enterAiUser().`);
}

async function writeUsage(db: Firestore, record: ReturnType<typeof usageRecord>) {
  try {
    await db.collection("aiUsage").add({ ...record, at: FieldValue.serverTimestamp() });
  } catch (error) {
    console.error("[ai-usage] could not record usage:", error instanceof Error ? error.message : error);
  }
}

export function createMeter(db: Firestore = adminDb): Meter {
  return {
    async start({ uid, feature, holdMicros }): Promise<MeterSession> {
      const mode = billingMode();

      if (mode !== "enforce") {
        return {
          async finish(event) {
            logLine(event);
            if (mode === "off") return;
            const resolved = await resolveCost(event);
            await writeUsage(db, usageRecord(resolved, chargeForCost(resolved.costMicros, resolved.model), false));
          },
          async abandon() {},
        };
      }

      if (!uid) throw new UnattributedAiError(feature);

      if (BULK_FEATURES.has(feature)) {
        const wallet = await getWallet(uid, db);
        const available = wallet.balanceMicros - wallet.heldMicros;
        if (available < holdMicros) throw new InsufficientCreditError(Math.max(0, available), holdMicros);
        return {
          async finish(event) {
            logLine(event);
            const resolved = await resolveCost(event);
            const chargeMicros = resolved.known ? chargeForCost(resolved.costMicros, resolved.model) : holdMicros;
            try {
              await chargeDirect(uid, chargeMicros, { feature: resolved.feature, model: resolved.model, inputTokens: resolved.inputTokens, outputTokens: resolved.outputTokens }, db);
            } catch (error) {
              console.error("[billing] could not charge", uid, error instanceof Error ? error.message : error);
            }
            await writeUsage(db, usageRecord(resolved, chargeMicros, true));
          },
          async abandon() {},
        };
      }

      // Throws InsufficientCreditError when the balance can't cover the worst case.
      const holdId = await reserveCredit(uid, holdMicros, feature, db);
      return {
        async finish(event) {
          logLine(event);
          const resolved = await resolveCost(event);
          // A cost nobody can tell us (a stopped stream on a provider without a
          // lookup) is charged at the hold: the provider has billed something,
          // and the hold is the most it can have been.
          const chargeMicros = resolved.known ? chargeForCost(resolved.costMicros, resolved.model) : holdMicros;
          try {
            await settleCredit(uid, holdId, chargeMicros, {
              feature: resolved.feature,
              model: resolved.model,
              inputTokens: resolved.inputTokens,
              outputTokens: resolved.outputTokens,
              ...(resolved.rateId ? { rateId: resolved.rateId } : {}),
            }, db);
          } catch (error) {
            // The hold stays until sweepStaleHolds (wallet.ts) releases it.
            console.error("[billing] could not settle hold", holdId, error instanceof Error ? error.message : error);
          }
          await writeUsage(db, usageRecord(resolved, chargeMicros, true));
        },
        async abandon() {
          try {
            await releaseCredit(uid, holdId, feature, db);
          } catch (error) {
            console.error("[billing] could not release hold", holdId, error instanceof Error ? error.message : error);
          }
        },
      };
    },
  };
}
