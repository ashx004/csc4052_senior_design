import "server-only";
import type { Incident, IncidentKind, ServiceId, ServiceStatus } from "./types";

const RETENTION_MS = 30 * 86400_000;

export async function saveServiceStatus(status: ServiceStatus) {
  const { adminDb } = await import("../firebaseAdmin");
  const reference = adminDb.collection("adminServiceStatus").doc(status.id);
  const newIncident = adminDb.collection("adminIncidents").doc();
  await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const previous = snapshot.data() as
      | (ServiceStatus & { incidentId: string | null })
      | undefined;
    if (previous && previous.checkedAt >= status.checkedAt) return;
    let incidentId = previous?.incidentId ?? null;
    if (
      (status.status === "down" || status.status === "degraded") &&
      !incidentId
    ) {
      incidentId = newIncident.id;
      transaction.set(newIncident, {
        service: status.id,
        kind: "outage",
        message: status.message,
        startedAt: status.checkedAt,
        resolvedAt: null,
      });
    }
    if (status.status === "healthy" && incidentId) {
      transaction.update(adminDb.collection("adminIncidents").doc(incidentId), {
        resolvedAt: status.checkedAt,
        expiresAt: new Date(Date.parse(status.checkedAt) + RETENTION_MS),
      });
      incidentId = null;
    }
    transaction.set(reference, { ...status, incidentId });
  });
}

const lastRecorded = new Map<string, number>();
export async function recordRequestIncident(
  service: ServiceId,
  kind: Exclude<IncidentKind, "outage">,
) {
  const key = `${service}:${kind}`;
  const now = Date.now();
  if (now - (lastRecorded.get(key) ?? 0) < 60_000) return;
  lastRecorded.set(key, now);
  try {
    const { adminDb } = await import("../firebaseAdmin");
    const messages = {
      timeout: "A service request exceeded its deadline.",
      request_failure:
        "A service request failed. Other requests may still succeed.",
      slow_generation:
        "AI generation exceeded 30 seconds or fell below the expected generation speed.",
    };
    const timestamp = new Date(now).toISOString();
    await adminDb
      .collection("adminIncidents")
      .doc(`${key}:${timestamp.slice(0, 16)}`)
      .set({
        service,
        kind,
        message: messages[kind],
        startedAt: timestamp,
        resolvedAt: timestamp,
        expiresAt: new Date(now + RETENTION_MS),
      });
  } catch {
    console.warn("[monitoring] Could not persist a service incident.");
  }
}

export async function readIncidentHistory(): Promise<Incident[]> {
  const { adminDb } = await import("../firebaseAdmin");
  const snapshot = await adminDb
    .collection("adminIncidents")
    .orderBy("startedAt", "desc")
    .limit(100)
    .get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      service: data.service,
      kind: data.kind,
      message: data.message,
      startedAt: data.startedAt,
      resolvedAt: data.resolvedAt,
    } as Incident;
  });
}

export async function recordWorkerHeartbeat() {
  const { adminDb } = await import("../firebaseAdmin");
  await adminDb
    .collection("adminMonitoring")
    .doc("worker")
    .set({ lastSeen: new Date().toISOString() });
}

export async function readWorkerHeartbeat(): Promise<string | null> {
  const { adminDb } = await import("../firebaseAdmin");
  const snapshot = await adminDb
    .collection("adminMonitoring")
    .doc("worker")
    .get();
  return snapshot.data()?.lastSeen ?? null;
}

export async function deleteExpiredMonitoringData(propertyId?: string) {
  const { adminDb } = await import("../firebaseAdmin");
  const collections = [adminDb.collection("adminIncidents")];
  if (propertyId)
    collections.push(
      adminDb
        .collection("adminAnalyticsPeaks")
        .doc(propertyId)
        .collection("samples"),
    );
  for (const collection of collections) {
    const expired = await collection
      .where("expiresAt", "<=", new Date())
      .limit(100)
      .get();
    if (expired.empty) continue;
    const batch = adminDb.batch();
    expired.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}
