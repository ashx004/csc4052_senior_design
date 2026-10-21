import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  documents: new Map<string, Record<string, unknown>>(),
  id: 0,
}));
vi.mock("../firebaseAdmin", () => {
  const reference = (path: string) => ({ path, id: path.split("/").pop() });
  return {
    adminDb: {
      collection: (collection: string) => ({
        doc: (id?: string) => reference(`${collection}/${id ?? ++mock.id}`),
      }),
      runTransaction: async (callback: (transaction: unknown) => unknown) =>
        callback({
          get: async (ref: { path: string }) => ({
            data: () => mock.documents.get(ref.path),
          }),
          set: (ref: { path: string }, data: Record<string, unknown>) =>
            mock.documents.set(ref.path, data),
          update: (ref: { path: string }, data: Record<string, unknown>) =>
            mock.documents.set(ref.path, {
              ...mock.documents.get(ref.path),
              ...data,
            }),
        }),
    },
  };
});
import { saveServiceStatus } from "./store";
beforeEach(() => {
  mock.documents.clear();
  mock.id = 0;
});
it("creates one interruption, keeps its start across repeated failures, and closes it on recovery", async () => {
  const status = {
    id: "vector" as const,
    status: "down" as const,
    message: "Not ready",
    latencyMs: 1,
    checkedAt: "2026-10-20T10:00:00Z",
  };
  await saveServiceStatus(status);
  await saveServiceStatus({ ...status, checkedAt: "2026-10-20T10:01:00Z" });
  const incidents = () =>
    [...mock.documents.entries()].filter(([key]) =>
      key.startsWith("adminIncidents/"),
    );
  expect(incidents()).toHaveLength(1);
  expect(incidents()[0][1].startedAt).toBe(status.checkedAt);
  await saveServiceStatus({
    ...status,
    status: "healthy",
    checkedAt: "2026-10-20T10:03:00Z",
  });
  expect(incidents()[0][1]).toMatchObject({
    resolvedAt: "2026-10-20T10:03:00Z",
    expiresAt: expect.any(Date),
  });
  expect(
    mock.documents.get("adminServiceStatus/vector")?.incidentId,
  ).toBeNull();
});
it("ignores an older failing probe arriving after recovery", async () => {
  const status = {
    id: "ai" as const,
    status: "healthy" as const,
    message: "Ready",
    latencyMs: 1,
    checkedAt: "2026-10-20T10:03:00Z",
  };
  await saveServiceStatus(status);
  await saveServiceStatus({
    ...status,
    status: "down",
    checkedAt: "2026-10-20T10:01:00Z",
  });
  expect(mock.documents.get("adminServiceStatus/ai")?.status).toBe("healthy");
  expect(
    [...mock.documents.keys()].filter((key) =>
      key.startsWith("adminIncidents/"),
    ),
  ).toHaveLength(0);
});
