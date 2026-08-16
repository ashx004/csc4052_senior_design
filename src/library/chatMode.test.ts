import { beforeEach, describe, expect, it } from "vitest";
import {
  getStoredTaskModel,
  setStoredTaskModel,
  getStoredReduceColdBoots,
  setStoredReduceColdBoots,
  getStoredUnifiedModel,
  setStoredUnifiedModel,
  getEffectiveModelKey,
  resetModelPreferences,
  isTaskModelKey,
  isUnifiedModelKey,
} from "./chatMode";

// vitest.config.ts runs these tests under environment: "node", which has no
// global localStorage (no jsdom) - chatMode.ts's getters already guard with
// typeof localStorage === "undefined" and fall back to their defaults, but
// the setters call localStorage.setItem directly, so a round-trip test
// needs a real (if minimal) Storage-shaped object in globalThis to write
// to and read back from.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = new MemoryStorage();
});

describe("getStoredTaskModel / setStoredTaskModel", () => {
  it("defaults to museGlimmer for every task when nothing is stored", () => {
    expect(getStoredTaskModel("chat")).toBe("museGlimmer");
    expect(getStoredTaskModel("quiz")).toBe("museGlimmer");
    expect(getStoredTaskModel("flashcards")).toBe("museGlimmer");
  });

  it("round-trips a stored value for one task without affecting the others", () => {
    setStoredTaskModel("quiz", "qwen3A3b");
    expect(getStoredTaskModel("quiz")).toBe("qwen3A3b");
    expect(getStoredTaskModel("chat")).toBe("museGlimmer");
    expect(getStoredTaskModel("flashcards")).toBe("museGlimmer");
  });

  it("falls back to the default on a corrupted/unrecognized stored value", () => {
    localStorage.setItem("chat-task-model-chat", "not-a-real-key");
    expect(getStoredTaskModel("chat")).toBe("museGlimmer");
  });
});

describe("getStoredReduceColdBoots / setStoredReduceColdBoots", () => {
  it("defaults to true (funnel every task onto one model by default)", () => {
    expect(getStoredReduceColdBoots()).toBe(true);
  });

  it("round-trips true/false", () => {
    setStoredReduceColdBoots(false);
    expect(getStoredReduceColdBoots()).toBe(false);
    setStoredReduceColdBoots(true);
    expect(getStoredReduceColdBoots()).toBe(true);
  });
});

describe("getStoredUnifiedModel / setStoredUnifiedModel", () => {
  it("defaults to museGlimmer (the only one of the 4 with native vision, so chat and OCR share one resident model)", () => {
    expect(getStoredUnifiedModel()).toBe("museGlimmer");
  });

  it("round-trips a stored value", () => {
    setStoredUnifiedModel("qwen3A3b");
    expect(getStoredUnifiedModel()).toBe("qwen3A3b");
  });

  it("falls back to the default on a corrupted/unrecognized stored value", () => {
    localStorage.setItem("chat-unified-model", "not-a-real-key");
    expect(getStoredUnifiedModel()).toBe("museGlimmer");
  });
});

describe("getEffectiveModelKey", () => {
  it("returns the per-task model once reduceColdBoots is explicitly turned off", () => {
    setStoredReduceColdBoots(false);
    setStoredTaskModel("quiz", "nemotron");
    expect(getEffectiveModelKey("quiz")).toBe("nemotron");
  });

  it("returns the unified model for every task by default (reduceColdBoots defaults to true)", () => {
    setStoredTaskModel("chat", "museGlimmer");
    setStoredTaskModel("quiz", "nemotron");
    setStoredTaskModel("flashcards", "qwenCoder");
    setStoredUnifiedModel("fastResident");

    expect(getEffectiveModelKey("chat")).toBe("fastResident");
    expect(getEffectiveModelKey("quiz")).toBe("fastResident");
    expect(getEffectiveModelKey("flashcards")).toBe("fastResident");
  });

  it("reverts to the per-task models when reduceColdBoots is turned off", () => {
    setStoredTaskModel("chat", "museGlimmer");
    setStoredUnifiedModel("fastResident");
    expect(getEffectiveModelKey("chat")).toBe("fastResident"); // still default-on at this point

    setStoredReduceColdBoots(false);
    expect(getEffectiveModelKey("chat")).toBe("museGlimmer");
  });
});

describe("resetModelPreferences", () => {
  it("resets all 5 model-selection preferences back to their defaults", () => {
    setStoredTaskModel("chat", "museGlimmer");
    setStoredTaskModel("quiz", "nemotron");
    setStoredTaskModel("flashcards", "qwenCoder");
    setStoredReduceColdBoots(false);
    setStoredUnifiedModel("museGlimmer");

    resetModelPreferences();

    expect(getStoredTaskModel("chat")).toBe("museGlimmer");
    expect(getStoredTaskModel("quiz")).toBe("museGlimmer");
    expect(getStoredTaskModel("flashcards")).toBe("museGlimmer");
    expect(getStoredReduceColdBoots()).toBe(true);
    expect(getStoredUnifiedModel()).toBe("museGlimmer");
  });
});

// Regression test for a bug found 2026-08-14: isUnifiedModelKey checked for
// "qwenCoder" instead of "qwen3A3b" (UnifiedModelKey's actual 3rd member —
// "qwenCoder" isn't a valid unified-model choice at all). Invisible through
// getStoredUnifiedModel's own round-trip tests above, since
// DEFAULT_UNIFIED_MODEL is *also* "qwen3A3b" — a wrongly-rejected
// "qwen3A3b" silently fell back to a default that happened to be the exact
// same value, masking the bug. Testing the validators directly is the only
// way this actually catches a regression.
describe("isTaskModelKey / isUnifiedModelKey", () => {
  it("accepts every real TaskModelKey", () => {
    for (const key of ["museGlimmer", "nemotron", "qwenCoder", "qwen3A3b"]) {
      expect(isTaskModelKey(key)).toBe(true);
    }
  });

  it("accepts every real UnifiedModelKey, including qwen3A3b", () => {
    for (const key of ["museGlimmer", "qwen3A3b", "fastResident"]) {
      expect(isUnifiedModelKey(key)).toBe(true);
    }
  });

  it("rejects qwenCoder as a unified model key (it's a task-only key)", () => {
    expect(isUnifiedModelKey("qwenCoder")).toBe(false);
  });

  it("rejects null and unrecognized strings", () => {
    expect(isTaskModelKey(null)).toBe(false);
    expect(isTaskModelKey("bogus")).toBe(false);
    expect(isUnifiedModelKey(null)).toBe(false);
    expect(isUnifiedModelKey("bogus")).toBe(false);
  });
});
