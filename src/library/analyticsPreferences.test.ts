import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  onSnapshot: vi.fn(),
  setDoc: vi.fn(),
  unsubscribe: vi.fn(),
  setAnalyticsEnabled: vi.fn(),
  setAnalyticsUser: vi.fn(() => 1),
}));
vi.mock("firebase/firestore", () => ({
  doc: (...parts: unknown[]) => parts.slice(1).join("/"),
  onSnapshot: mocks.onSnapshot,
  setDoc: mocks.setDoc,
  serverTimestamp: () => "server-time",
}));
vi.mock("./firebase", () => ({ db: {} }));
vi.mock("./analytics", () => ({
  setAnalyticsEnabled: mocks.setAnalyticsEnabled,
  setAnalyticsUser: mocks.setAnalyticsUser,
}));
import {
  defaultAnalyticsChoice,
  watchAnalyticsPreference,
} from "./analyticsPreferences";

function receivePreference(data?: Record<string, unknown>, pending = false) {
  mocks.onSnapshot.mock.calls.at(-1)![2]({
    data: () => data,
    metadata: { hasPendingWrites: pending },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.onSnapshot.mockReturnValue(mocks.unsubscribe);
  mocks.setDoc.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

it("preselects sharing but preserves a legacy browser opt-out", () => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  expect(defaultAnalyticsChoice()).toBe(true);
  vi.stubGlobal("localStorage", { getItem: () => "disabled" });
  expect(defaultAnalyticsChoice()).toBe(false);
});

it("asks accounts without a choice and keeps collection off", () => {
  const changed = vi.fn();
  watchAnalyticsPreference("alice", changed);
  receivePreference();
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({ needsChoice: true, enabled: false }),
  );
  expect(mocks.setAnalyticsEnabled).toHaveBeenLastCalledWith(false, 1);
});

it("validates stored choices and synchronizes remote opt-outs", () => {
  watchAnalyticsPreference("alice", vi.fn());
  receivePreference({ enabled: "true" });
  expect(mocks.setAnalyticsEnabled).toHaveBeenLastCalledWith(false, 1);
  receivePreference({ enabled: true });
  expect(mocks.setAnalyticsEnabled).toHaveBeenLastCalledWith(true, 1);
  receivePreference({ enabled: false });
  expect(mocks.setAnalyticsEnabled).toHaveBeenLastCalledWith(false, 1);
});

it("does not enable collection from an uncommitted local write", () => {
  watchAnalyticsPreference("alice", vi.fn());
  receivePreference({ enabled: true }, true);
  expect(mocks.setAnalyticsEnabled).not.toHaveBeenCalled();
});

it("saves to the authenticated account and only enables after success", async () => {
  let finish!: () => void;
  mocks.setDoc.mockReturnValue(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  const changed = vi.fn();
  const session = watchAnalyticsPreference("alice", changed);
  const saving = session.save(true);
  expect(mocks.setAnalyticsEnabled).not.toHaveBeenCalledWith(true, 1);
  expect(mocks.setDoc).toHaveBeenCalledWith("users/alice/settings/analytics", {
    enabled: true,
    updatedAt: "server-time",
  });
  finish();
  await saving;
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({
      enabled: true,
      needsChoice: false,
      isSaving: false,
    }),
  );
});

it("stops immediately on opt-out and stays off if saving fails", async () => {
  const changed = vi.fn();
  const session = watchAnalyticsPreference("alice", changed);
  receivePreference({ enabled: true });
  mocks.setDoc.mockRejectedValue(new Error("permission denied"));
  const saving = session.save(false);
  expect(mocks.setAnalyticsEnabled).toHaveBeenLastCalledWith(false, 1);
  await saving;
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({
      enabled: false,
      isSaving: false,
      error: expect.any(String),
    }),
  );
});

it("ignores a save finishing after logout or an account switch", async () => {
  let finish!: () => void;
  mocks.setDoc.mockReturnValue(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  const changed = vi.fn();
  const session = watchAnalyticsPreference("alice", changed);
  const saving = session.save(true);
  session.stop();
  changed.mockClear();
  finish();
  await saving;
  expect(mocks.unsubscribe).toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
  expect(mocks.setAnalyticsEnabled).not.toHaveBeenCalledWith(true, 1);
});

it("disables collection if reading the preference fails", () => {
  const changed = vi.fn();
  watchAnalyticsPreference("alice", changed);
  mocks.onSnapshot.mock.calls[0][3](new Error("offline"));
  expect(mocks.setAnalyticsEnabled).toHaveBeenLastCalledWith(false, 1);
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({
      enabled: false,
      isLoading: false,
      error: expect.any(String),
    }),
  );
});

it("waits for the server before trusting a cached opt-in", () => {
  const changed = vi.fn();
  watchAnalyticsPreference("alice", changed);
  mocks.onSnapshot.mock.calls[0][2]({
    data: () => ({ enabled: true }),
    metadata: { hasPendingWrites: false, fromCache: true },
  });
  expect(mocks.setAnalyticsEnabled).toHaveBeenLastCalledWith(false, 1);
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({ enabled: false, isLoading: true }),
  );
});

it("does not let a rollback re-enable sharing after a failed opt-out", async () => {
  const changed = vi.fn();
  const session = watchAnalyticsPreference("alice", changed);
  receivePreference({ enabled: true });
  mocks.setDoc.mockRejectedValueOnce(new Error("offline"));
  await session.save(false);
  receivePreference({ enabled: true });
  expect(mocks.setAnalyticsEnabled).toHaveBeenLastCalledWith(false, 1);
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({ failedChoice: false }),
  );
  await session.save(false);
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({ enabled: false, failedChoice: null, error: "" }),
  );
});

it("requires a reload after the preference listener fails", async () => {
  const session = watchAnalyticsPreference("alice", vi.fn());
  mocks.onSnapshot.mock.calls[0][3](new Error("permission denied"));
  await session.save(true);
  expect(mocks.setDoc).not.toHaveBeenCalled();
});

it("keeps sharing off if the listener fails while an opt-in is saving", async () => {
  let finish!: () => void;
  mocks.setDoc.mockReturnValue(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  const changed = vi.fn();
  const session = watchAnalyticsPreference("alice", changed);
  const saving = session.save(true);
  mocks.onSnapshot.mock.calls[0][3](new Error("permission denied"));
  finish();
  await saving;
  expect(mocks.setAnalyticsEnabled).not.toHaveBeenCalledWith(true, 1);
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({
      enabled: false,
      needsReload: true,
      isSaving: false,
    }),
  );
});

it("honors a confirmed remote opt-out received while saving", async () => {
  let finish!: () => void;
  mocks.setDoc.mockReturnValue(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  const changed = vi.fn();
  const session = watchAnalyticsPreference("alice", changed);
  const saving = session.save(true);
  receivePreference({ enabled: false });
  finish();
  await saving;
  expect(mocks.setAnalyticsEnabled).not.toHaveBeenCalledWith(true, 1);
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({ enabled: false, isSaving: false }),
  );
});
