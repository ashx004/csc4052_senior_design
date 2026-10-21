import "server-only";
import type { ReportRow } from "./analyticsReportContract";
import type { UserPeaks } from "./monitoring/types";

export function updateUserPeaks(
  previous: UserPeaks | undefined,
  concurrent: number | null,
  daily: ReportRow[],
  now: string,
): UserPeaks {
  const peaks: UserPeaks = previous
    ? { ...previous }
    : {
        concurrent: null,
        concurrentAt: now,
        daily: null,
        dailyDate: null,
        since: now,
      };
  if (
    concurrent !== null &&
    (peaks.concurrent === null || concurrent > peaks.concurrent)
  ) {
    peaks.concurrent = concurrent;
    peaks.concurrentAt = now;
  }
  for (const row of daily) {
    if (peaks.daily === null || row.count > peaks.daily) {
      peaks.daily = row.count;
      peaks.dailyDate = row.label;
    }
  }
  return peaks;
}

export async function saveUserCounts(
  propertyId: string,
  concurrent: number | null,
  daily: ReportRow[] = [],
  now = new Date().toISOString(),
): Promise<UserPeaks> {
  if (
    !/^\d+$/.test(propertyId) ||
    (concurrent !== null &&
      (!Number.isSafeInteger(concurrent) || concurrent < 0))
  ) {
    throw new Error("Invalid user count sample.");
  }
  if (
    daily.some(
      (row) =>
        !/^\d{8}$/.test(row.label) ||
        !Number.isSafeInteger(row.count) ||
        row.count < 0,
    )
  ) {
    throw new Error("Invalid daily user counts.");
  }
  const { adminDb } = await import("./firebaseAdmin");
  const reference = adminDb.collection("adminAnalyticsPeaks").doc(propertyId);
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const previous = snapshot.data()?.peaks as UserPeaks | undefined;
    const peaks = updateUserPeaks(previous, concurrent, daily, now);
    transaction.set(reference, { peaks, updatedAt: now }, { merge: true });
    for (const row of daily) {
      transaction.set(reference.collection("daily").doc(row.label), {
        activeUsers: row.count,
        retrievedAt: now,
      });
    }
    if (concurrent !== null) {
      transaction.set(reference.collection("samples").doc(now.slice(0, 16)), {
        activeUsers: concurrent,
        checkedAt: now,
        expiresAt: new Date(Date.parse(now) + 30 * 86400_000),
      });
    }
    return peaks;
  });
}
