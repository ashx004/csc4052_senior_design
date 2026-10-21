import "server-only";
import {
  createAlertBudget,
  isIgnoredError,
  recordOccurrence,
  TEST_ERROR_MESSAGE,
  type AlertReason,
  type ErrorGroupState,
  type ErrorSource,
} from "./alertRules";
import { errorFingerprint, normalizeRoute } from "./errorFingerprint";

// Error tracking for the site: every uncaught server error (instrumentation.ts)
// and browser error (/api/client-errors) lands here. Each error is grouped in
// the Firestore `errorGroups` collection (server-only; the rules deny clients)
// and alertRules.ts decides which ones email the addresses in ALERT_EMAILS.
//
// Reporting must never make things worse: every failure in here is caught and
// logged, never thrown back into the request that hit the original error.

export type ErrorReport = {
  source: ErrorSource;
  message: string;
  name?: string;
  stack?: string;
  route?: string;
  method?: string;
  digest?: string;
  userAgent?: string;
  build?: string;
};

export const ERROR_GROUPS_COLLECTION = "errorGroups";
const budget = createAlertBudget();

export async function reportError(report: ErrorReport): Promise<void> {
  try {
    const message = (report.message || "Unknown error").slice(0, 1000);
    if (isIgnoredError(report.source, message)) return;

    const fingerprint = errorFingerprint(report.source, message, report.route);
    console.error(`[error-tracking] ${report.source} ${fingerprint} ${report.route ?? ""}: ${message}`);

    const reason = await recordInFirestore(fingerprint, { ...report, message });
    if (reason) await sendAlert(fingerprint, reason, { ...report, message });
  } catch (error) {
    console.error("[error-tracking] Could not record an error:", error);
  }
}

async function recordInFirestore(fingerprint: string, report: ErrorReport): Promise<AlertReason | null> {
  const { adminDb } = await import("../firebaseAdmin");
  const ref = adminDb.collection(ERROR_GROUPS_COLLECTION).doc(fingerprint);
  const now = Date.now();

  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const previous = snapshot.exists ? (snapshot.data()?.state as ErrorGroupState) : undefined;
    const { state, reason } = recordOccurrence(previous, now, report.message === TEST_ERROR_MESSAGE);
    transaction.set(ref, {
      state,
      source: report.source,
      message: report.message,
      name: report.name ?? null,
      route: normalizeRoute(report.route) || null,
      method: report.method ?? null,
      // The latest occurrence's details; enough to start debugging from.
      lastStack: report.stack?.slice(0, 4000) ?? null,
      lastDigest: report.digest ?? null,
      lastUserAgent: report.userAgent?.slice(0, 300) ?? null,
      lastBuild: report.build ?? null,
      lastSeenAt: new Date(now),
    });
    return reason;
  });
}

function alertRecipients(): string[] {
  return (process.env.ALERT_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

async function sendAlert(fingerprint: string, reason: AlertReason, report: ErrorReport) {
  const recipients = alertRecipients();
  if (recipients.length === 0) {
    console.warn("[error-tracking] ALERT_EMAILS is not set, so no alert email was sent.");
    return;
  }
  if (!budget.tryTake(Date.now())) {
    console.warn(`[error-tracking] Hourly alert limit reached; skipped the email for ${fingerprint}.`);
    return;
  }

  const { sendEmail } = await import("../email/resend");
  const email = buildAlertEmail(fingerprint, reason, report);
  // One send per address: sendEmail takes a single recipient. The idempotency
  // key stops a retry from emailing the same alert twice.
  const minute = Math.floor(Date.now() / 60_000);
  await Promise.all(
    recipients.map((to) =>
      sendEmail({ to, ...email, idempotencyKey: `alert-${fingerprint}-${minute}-${to}` }).catch((error) =>
        console.error(`[error-tracking] Alert email to ${to} failed:`, error),
      ),
    ),
  );
}

const REASON_LABEL: Record<AlertReason, string> = {
  new: "New error",
  spike: "Error spike",
  test: "Test alert",
};

export function buildAlertEmail(fingerprint: string, reason: AlertReason, report: ErrorReport) {
  const where = report.source === "server" ? "Server" : "Browser";
  const subject = `[Catalyst] ${REASON_LABEL[reason]} (${where}): ${report.message.slice(0, 90)}`;
  const details: [string, string | undefined][] = [
    ["Why you got this", reason === "spike" ? "This error happened 10+ times in 15 minutes." : reason === "new" ? "First time this error has been seen." : "An administrator triggered a test."],
    ["Where", `${where}${report.method ? ` ${report.method}` : ""} ${report.route ?? "(unknown route)"}`],
    ["Error", `${report.name ? `${report.name}: ` : ""}${report.message}`],
    ["Group id", `${fingerprint} (Firestore errorGroups/${fingerprint})`],
    ["Build", report.build],
    ["Digest", report.digest],
    ["Browser", report.userAgent],
  ];
  const rows = details.filter(([, value]) => value);
  const text = [
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    report.stack ? `Stack:\n${report.stack.slice(0, 4000)}` : "",
    "",
    "What to do: docs/INCIDENT_RESPONSE.md",
  ].join("\n");
  const html = `
    <h2 style="margin:0 0 12px">${escapeHtml(REASON_LABEL[reason])}</h2>
    <table cellpadding="4" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
      ${rows.map(([label, value]) => `<tr><td style="vertical-align:top;color:#666">${escapeHtml(label)}</td><td>${escapeHtml(value!)}</td></tr>`).join("")}
    </table>
    ${report.stack ? `<pre style="background:#f4f4f4;padding:12px;font-size:12px;white-space:pre-wrap">${escapeHtml(report.stack.slice(0, 4000))}</pre>` : ""}
    <p style="font-family:sans-serif;font-size:14px">What to do: see <code>docs/INCIDENT_RESPONSE.md</code> in the repo.</p>`;
  return { subject, html, text };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
