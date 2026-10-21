import { describe, expect, it } from "vitest";
import { ALERT_RULES, createAlertBudget, isIgnoredError, recordOccurrence } from "./alertRules";

const MINUTE = 60_000;

describe("recordOccurrence", () => {
  it("alerts the first time an error is seen", () => {
    const { state, reason } = recordOccurrence(undefined, 1000);
    expect(reason).toBe("new");
    expect(state).toMatchObject({ count: 1, windowCount: 1, lastAlertAt: 1000 });
  });

  it("stays quiet for repeats below the spike threshold", () => {
    let { state } = recordOccurrence(undefined, 0);
    for (let i = 1; i < ALERT_RULES.spikeThreshold - 1; i++) {
      const next = recordOccurrence(state, i * 1000);
      expect(next.reason).toBeNull();
      state = next.state;
    }
  });

  it("alerts on a spike once the first alert's cooldown has passed", () => {
    const start = 0;
    let { state } = recordOccurrence(undefined, start);
    // Move past the cooldown, then hit the threshold inside one window.
    const later = start + ALERT_RULES.groupCooldownMs;
    const reasons = [];
    for (let i = 0; i < ALERT_RULES.spikeThreshold; i++) {
      const next = recordOccurrence(state, later + i * 1000);
      reasons.push(next.reason);
      state = next.state;
    }
    expect(reasons.filter(Boolean)).toEqual(["spike"]);
    expect(reasons.at(-1)).toBe("spike");
  });

  it("does not alert twice for one group within the cooldown", () => {
    let { state } = recordOccurrence(undefined, 0);
    const reasons = [];
    for (let i = 1; i <= ALERT_RULES.spikeThreshold * 3; i++) {
      const next = recordOccurrence(state, i * 1000);
      reasons.push(next.reason);
      state = next.state;
    }
    expect(reasons.every((r) => r === null)).toBe(true);
  });

  it("resets the spike window after it expires", () => {
    let { state } = recordOccurrence(undefined, 0);
    state = recordOccurrence(state, 5 * MINUTE).state;
    const { state: after } = recordOccurrence(state, ALERT_RULES.spikeWindowMs + 5 * MINUTE);
    expect(after.windowCount).toBe(1);
    expect(after.count).toBe(3);
  });

  it("always alerts for the admin test error", () => {
    const first = recordOccurrence(undefined, 0, true);
    const second = recordOccurrence(first.state, 1000, true);
    expect([first.reason, second.reason]).toEqual(["test", "test"]);
  });
});

describe("createAlertBudget", () => {
  it("caps alert emails per hour and frees them as the hour slides", () => {
    const budget = createAlertBudget(2);
    expect(budget.tryTake(0)).toBe(true);
    expect(budget.tryTake(1)).toBe(true);
    expect(budget.tryTake(2)).toBe(false);
    expect(budget.tryTake(60 * MINUTE)).toBe(true);
  });
});

describe("isIgnoredError", () => {
  it("ignores browser noise but never server errors", () => {
    expect(isIgnoredError("client", "ResizeObserver loop completed with undelivered notifications.")).toBe(true);
    expect(isIgnoredError("client", "TypeError: Failed to fetch")).toBe(true);
    expect(isIgnoredError("server", "TypeError: Failed to fetch")).toBe(false);
    expect(isIgnoredError("client", "Cannot read properties of undefined (reading 'title')")).toBe(false);
  });
});
