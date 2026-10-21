import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  data: new Map<string, unknown>(),
  chain: Promise.resolve(),
}));
vi.mock("./firebaseAdmin", () => {
  function reference(path: string) {
    return {
      path,
      collection: (name: string) => ({
        doc: (id: string) => reference(`${path}/${name}/${id}`),
      }),
    };
  }
  return {
    adminDb: {
      collection: (name: string) => ({
        doc: (id: string) => reference(`${name}/${id}`),
      }),
      runTransaction: (
        callback: (transaction: unknown) => Promise<unknown>,
      ) => {
        const task = mock.chain.then(() =>
          callback({
            get: async (ref: { path: string }) => ({
              data: () => mock.data.get(ref.path),
            }),
            set: (ref: { path: string }, value: unknown) =>
              mock.data.set(ref.path, value),
          }),
        );
        mock.chain = task.then(() => {});
        return task;
      },
    },
  };
});
import { saveUserCounts, updateUserPeaks } from "./analyticsPeaks";
beforeEach(() => {
  mock.chain = Promise.resolve();
  mock.data.clear();
});

it("keeps peaks across lower counts and day boundaries", () => {
  const first = updateUserPeaks(
    undefined,
    12,
    [{ label: "20261019", count: 40 }],
    "2026-10-19T22:00:00Z",
  );
  const next = updateUserPeaks(
    first,
    3,
    [{ label: "20261020", count: 5 }],
    "2026-10-20T09:00:00Z",
  );
  expect(next).toEqual(first);
  expect(updateUserPeaks(next, 18, [], "2026-10-20T10:00:00Z")).toMatchObject({
    concurrent: 18,
    daily: 40,
    concurrentAt: "2026-10-20T10:00:00Z",
  });
});

it("stores samples and daily counts while transactions preserve the highest peak", async () => {
  for (const count of [12, 20, 3]) {
    await saveUserCounts(
      "123",
      count,
      [{ label: "20261020", count: 50 }],
      "2026-10-20T10:00:00Z",
    );
  }
  expect(mock.data.get("adminAnalyticsPeaks/123")).toMatchObject({
    peaks: { concurrent: 20, daily: 50 },
  });
  expect(mock.data.get("adminAnalyticsPeaks/123/daily/20261020")).toMatchObject(
    { activeUsers: 50 },
  );
  expect(
    mock.data.get("adminAnalyticsPeaks/123/samples/2026-10-20T10:00"),
  ).toMatchObject({ activeUsers: 3, expiresAt: expect.any(Date) });
});

it("keeps properties separate and rejects malformed counts or document paths", async () => {
  await saveUserCounts("123", 10);
  await saveUserCounts("456", 2);
  expect(mock.data.get("adminAnalyticsPeaks/456")).toMatchObject({
    peaks: { concurrent: 2 },
  });
  await expect(saveUserCounts("../x", 1)).rejects.toThrow();
  await expect(saveUserCounts("123", -1)).rejects.toThrow();
  await expect(
    saveUserCounts("123", null, [{ label: "bad/date", count: 5 }]),
  ).rejects.toThrow();
});

it("distinguishes an unobserved daily peak from a measured zero", () => {
  const first = updateUserPeaks(undefined, 0, [], "2026-10-20T10:00:00Z");
  expect(first).toMatchObject({ concurrent: 0, daily: null, dailyDate: null });
  const next = updateUserPeaks(
    first,
    null,
    [{ label: "20261020", count: 0 }],
    "2026-10-20T10:01:00Z",
  );
  expect(next).toMatchObject({
    concurrent: 0,
    daily: 0,
    dailyDate: "20261020",
  });
});
