import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveModelFromKey, FAST_MODEL_KEEP_ALIVE } from "./ollamaClient";

const ENV_KEYS = ["OLLAMA_MODEL_MUSE_GLIMMER", "OLLAMA_MODEL_KEEP_ALIVE"] as const;

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
  it("resolves to the literal Muse Glimmer fallback when no env var is set", () => {
    expect(resolveModelFromKey("museGlimmer")).toBe("muse-glimmer:latest");
  });

  it("prefers OLLAMA_MODEL_MUSE_GLIMMER over the literal fallback", () => {
    process.env.OLLAMA_MODEL_MUSE_GLIMMER = "muse-glimmer:custom-tag";
    expect(resolveModelFromKey("museGlimmer")).toBe("muse-glimmer:custom-tag");
  });

  it("resolves to Muse Glimmer regardless of key, including legacy/unrecognized/missing keys", () => {
    expect(resolveModelFromKey("someOldStoredKey")).toBe("muse-glimmer:latest");
    expect(resolveModelFromKey("not-a-real-key")).toBe("muse-glimmer:latest");
    expect(resolveModelFromKey(undefined)).toBe("muse-glimmer:latest");
  });

  it("resolves the internal-only ocr key to the same Muse Glimmer model", () => {
    expect(resolveModelFromKey("ocr")).toBe("muse-glimmer:latest");
    process.env.OLLAMA_MODEL_MUSE_GLIMMER = "muse-glimmer:custom-tag";
    expect(resolveModelFromKey("ocr")).toBe("muse-glimmer:custom-tag");
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
