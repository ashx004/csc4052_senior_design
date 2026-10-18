import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { adminDb } from "@/src/library/firebaseAdmin";
import type { UsageEvent } from "@/src/library/ai/aiFetch";

// Records what every cloud AI request cost and who it was for.
//
// BILLING_MODE=log (the default) is the dry run: each request is written to
// aiUsage/{id} with the student it would be charged to, and no balance is
// touched and nobody is blocked. Running this for a few days and comparing
// the totals (scripts/usageReport.mts) with the OpenRouter dashboard proves
// the metering before real money moves. BILLING_MODE=off records nothing.
//
// aiUsage is server-only: the catch-all rule in firestore.rules denies every
// client read and write.

export type BillingMode = "off" | "log";

export function billingMode(): BillingMode {
  return process.env.BILLING_MODE === "off" ? "off" : "log";
}

export function usageRecord(event: UsageEvent) {
  return {
    uid: event.uid ?? null,
    feature: event.feature,
    model: event.model,
    inputTokens: event.inputTokens,
    outputTokens: event.outputTokens,
    costMicros: event.costMicros,
    costSource: event.costSource,
    rateId: event.rateId ?? null,
    requestId: event.requestId ?? null,
    fallback: event.fallback,
    incomplete: event.incomplete ?? false,
    charged: false,
  };
}

/** Never throws: a failed write must not fail the student's AI request. */
export async function meterUsage(event: UsageEvent, db: Firestore = adminDb): Promise<void> {
  console.info(`[ai-usage] ${JSON.stringify(event)}`);
  // Logged loudly so a route missing enterAiUser() is found during the dry run, not after charging starts.
  if (!event.uid) console.warn(`[ai-usage] unattributed ${event.feature} request: its route never called enterAiUser().`);
  if (billingMode() === "off") return;
  try {
    await db.collection("aiUsage").add({ ...usageRecord(event), at: FieldValue.serverTimestamp() });
  } catch (error) {
    console.error("[ai-usage] could not record usage:", error instanceof Error ? error.message : error);
  }
}
