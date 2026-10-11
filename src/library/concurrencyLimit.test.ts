import { describe, expect, it } from "vitest";
import { acquireSlot } from "./concurrencyLimit";

describe("acquireSlot", () => {
  it("allows one job per student and refuses a second until the first is released", () => {
    const first = acquireSlot("t1", "alice", { perKey: 1, total: 5 });
    expect(first.ok).toBe(true);
    expect(acquireSlot("t1", "alice", { perKey: 1, total: 5 })).toEqual({ ok: false, reason: "per-user" });
    expect(acquireSlot("t1", "bob", { perKey: 1, total: 5 }).ok).toBe(true);
    if (first.ok) first.release();
    expect(acquireSlot("t1", "alice", { perKey: 1, total: 5 }).ok).toBe(true);
  });

  it("caps the whole site", () => {
    const held = [acquireSlot("t2", "a", { perKey: 1, total: 2 }), acquireSlot("t2", "b", { perKey: 1, total: 2 })];
    expect(held.every((h) => h.ok)).toBe(true);
    expect(acquireSlot("t2", "c", { perKey: 1, total: 2 })).toEqual({ ok: false, reason: "site-wide" });
    const [a] = held;
    if (a.ok) a.release();
    expect(acquireSlot("t2", "c", { perKey: 1, total: 2 }).ok).toBe(true);
  });

  it("release is idempotent and never frees a slot twice", () => {
    const slot = acquireSlot("t3", "a", { perKey: 1, total: 1 });
    if (slot.ok) {
      slot.release();
      slot.release();
    }
    expect(acquireSlot("t3", "a", { perKey: 1, total: 1 }).ok).toBe(true);
    expect(acquireSlot("t3", "b", { perKey: 1, total: 1 })).toEqual({ ok: false, reason: "site-wide" });
  });
});
