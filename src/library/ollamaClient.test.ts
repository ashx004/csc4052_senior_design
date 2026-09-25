import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveModelFromKey, FAST_MODEL_KEEP_ALIVE } from "./ollamaClient";

const ENV_KEYS = ["OLLAMA_MODEL_MAIN", "OLLAMA_MODEL_KEEP_ALIVE"] as const;

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("resolveModelFromKey", () => {
  it("throws when OLLAMA_MODEL_MAIN is not configured — no hardcoded model-name fallback", () => {
    expect(() => resolveModelFromKey("someKey")).toThrow("OLLAMA_MODEL_MAIN is not configured.");
  });

  it("resolves to OLLAMA_MODEL_MAIN when set", () => {
    process.env.OLLAMA_MODEL_MAIN = "qwen3:30b-a3b";
    expect(resolveModelFromKey("someKey")).toBe("qwen3:30b-a3b");
  });

  it("resolves to the same model regardless of key, including legacy/unrecognized/missing keys", () => {
    process.env.OLLAMA_MODEL_MAIN = "qwen3:30b-a3b";
    expect(resolveModelFromKey("someOldStoredKey")).toBe("qwen3:30b-a3b");
    expect(resolveModelFromKey("not-a-real-key")).toBe("qwen3:30b-a3b");
    expect(resolveModelFromKey(undefined)).toBe("qwen3:30b-a3b");
  });
});

describe("FAST_MODEL_KEEP_ALIVE", () => {
  it("is 2h by default when OLLAMA_MODEL_KEEP_ALIVE is unset", () => {
    expect(FAST_MODEL_KEEP_ALIVE).toBe("2h");
  });

  // FAST_MODEL_KEEP_ALIVE is a module-level constant, read once at import
  // time (see every call site: chat/route.ts, warm-model/route.ts) rather
  // than a function - vi.resetModules() + a fresh dynamic import is the
  // correct way to exercise that read with the env var actually set,
  // without changing the exported shape every real caller depends on.
  it("reads OLLAMA_MODEL_KEEP_ALIVE when set", async () => {
    process.env.OLLAMA_MODEL_KEEP_ALIVE = "30m";
    vi.resetModules();
    const fresh = await import("./ollamaClient");
    expect(fresh.FAST_MODEL_KEEP_ALIVE).toBe("30m");
  });
});
