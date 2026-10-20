// When an error becomes an alert email. Pure functions so the rules can be
// unit-tested without Firestore or Resend; errorReporter.ts applies them.
//
// Errors are grouped by fingerprint (same source + message + route), so one
// bug hitting fifty students is one group, not fifty emails.
export const ALERT_RULES = {
  // A group that has never been seen before always alerts.
  // A known group alerts again when it happens this many times...
  spikeThreshold: 10,
  // ...within this window,
  spikeWindowMs: 15 * 60_000,
  // and at most once per group per cooldown.
  groupCooldownMs: 60 * 60_000,
  // Hard cap on alert emails per hour across every group. /api/client-errors
  // is public, so this is what stops a flood of fake errors from becoming a
  // flood of email.
  maxAlertsPerHour: 10,
};

// The admin test route throws exactly this. It always alerts (still within
// maxAlertsPerHour) so "Test the alerts" works more than once.
export const TEST_ERROR_MESSAGE = "Monitoring test error (triggered by an administrator)";

// Browser noise that says nothing about our code: offline students, browser
// extensions, cross-origin scripts that hide their message, and cancelled
// requests. Server-side errors are never ignored.
const IGNORED_CLIENT_MESSAGES = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Failed to fetch/i,
  /Load failed/i,
  /NetworkError when attempting to fetch/i,
  /AbortError|The (user|operation) aborted/i,
];

export type ErrorSource = "server" | "client";

export function isIgnoredError(source: ErrorSource, message: string): boolean {
  return source === "client" && IGNORED_CLIENT_MESSAGES.some((pattern) => pattern.test(message));
}

export type ErrorGroupState = {
  count: number;
  firstSeen: number;
  lastSeen: number;
  windowStart: number;
  windowCount: number;
  lastAlertAt: number | null;
};

export type AlertReason = "new" | "spike" | "test";

/** The group's state after one more occurrence, and why it should alert (if it should). */
export function recordOccurrence(
  previous: ErrorGroupState | undefined,
  now: number,
  isTest = false,
): { state: ErrorGroupState; reason: AlertReason | null } {
  if (!previous) {
    return {
      state: { count: 1, firstSeen: now, lastSeen: now, windowStart: now, windowCount: 1, lastAlertAt: now },
      reason: isTest ? "test" : "new",
    };
  }

  const windowExpired = now - previous.windowStart >= ALERT_RULES.spikeWindowMs;
  const state: ErrorGroupState = {
    ...previous,
    count: previous.count + 1,
    lastSeen: now,
    windowStart: windowExpired ? now : previous.windowStart,
    windowCount: windowExpired ? 1 : previous.windowCount + 1,
  };

  const coolingDown = previous.lastAlertAt !== null && now - previous.lastAlertAt < ALERT_RULES.groupCooldownMs;
  let reason: AlertReason | null = null;
  if (isTest) reason = "test";
  else if (state.windowCount >= ALERT_RULES.spikeThreshold && !coolingDown) reason = "spike";

  if (reason) state.lastAlertAt = now;
  return { state, reason };
}

/** Sliding one-hour cap on alert emails. In memory: the site is one Node process. */
export function createAlertBudget(maxPerHour = ALERT_RULES.maxAlertsPerHour) {
  const sent: number[] = [];
  return {
    tryTake(now: number): boolean {
      while (sent.length && now - sent[0] >= 60 * 60_000) sent.shift();
      if (sent.length >= maxPerHour) return false;
      sent.push(now);
      return true;
    },
  };
}
