import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveModelFromKey, FAST_MODEL_KEEP_ALIVE } from "./ollamaClient";

const ENV_KEYS = [
  "OLLAMA_MODEL",
  "OLLAMA_MODEL_FAST",
  "OLLAMA_MODEL_QUALITY",
  "OLLAMA_MODEL_MUSE_GLIMMER",
  "OLLAMA_MODEL_NEMOTRON",
  "OLLAMA_MODEL_QWEN_CODER",
  "OLLAMA_OCR_MODEL",
  "OLLAMA_MODEL_KEEP_ALIVE",
] as const;

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
  it("resolves each known key to its literal fallback when no env var is set", () => {
    expect(resolveModelFromKey("museGlimmer")).toBe("muse-glimmer:latest");
    expect(resolveModelFromKey("nemotron")).toBe("nemotron-3.5-lightning:latest");
    expect(resolveModelFromKey("qwenCoder")).toBe("qwen3-coder:30b");
    expect(resolveModelFromKey("qwen3A3b")).toBe("qwen3:30b-a3b");
    expect(resolveModelFromKey("fastResident")).toBe("gpt-oss:20b");
  });

  it("prefers the specific env var over the literal fallback", () => {
    process.env.OLLAMA_MODEL_MUSE_GLIMMER = "muse-glimmer:custom-tag";
    expect(resolveModelFromKey("museGlimmer")).toBe("muse-glimmer:custom-tag");
  });

  // Changed 2026-08-16: the app-wide default is now Muse Glimmer (the one
  // model with native vision, see chatMode.ts's DEFAULT_TASK_MODEL), not
  // qwen3A3b - an invalid/missing key falls open to whatever "museGlimmer"
  // itself resolves to.
  it("falls open to museGlimmer (the app-wide default) on an invalid or missing key, never throwing", () => {
    expect(resolveModelFromKey("not-a-real-key")).toBe("muse-glimmer:latest");
    expect(resolveModelFromKey(undefined)).toBe("muse-glimmer:latest");
  });

  it("qwen3A3b falls back through OLLAMA_MODEL_QUALITY, then OLLAMA_MODEL, then the literal", () => {
    process.env.OLLAMA_MODEL = "shared-fallback-model";
    expect(resolveModelFromKey("qwen3A3b")).toBe("shared-fallback-model");
    process.env.OLLAMA_MODEL_QUALITY = "qwen3:30b-a3b-custom";
    expect(resolveModelFromKey("qwen3A3b")).toBe("qwen3:30b-a3b-custom");
  });

  it("an invalid key falls open through the same OLLAMA_MODEL_MUSE_GLIMMER chain as museGlimmer", () => {
    process.env.OLLAMA_MODEL_MUSE_GLIMMER = "muse-glimmer:custom-tag";
    expect(resolveModelFromKey("not-a-real-key")).toBe("muse-glimmer:custom-tag");
  });

  // Changed 2026-08-16: defaults to muse-glimmer:latest (was qwen3-vl:8b) -
  // Muse Glimmer's native vision encoder replaced the separate dedicated
  // OCR model, see OLLAMA_OCR_MODEL in env.example. Kept as its own env var
  // (not folded into OLLAMA_MODEL_MUSE_GLIMMER) so this and ocrClient.ts's
  // real document-OCR calls stay sourced from one place.
  it("resolves the internal-only ocr key for co-warming vision alongside the effective chat model", () => {
    expect(resolveModelFromKey("ocr")).toBe("muse-glimmer:latest");
    process.env.OLLAMA_OCR_MODEL = "qwen3-vl:custom-tag";
    expect(resolveModelFromKey("ocr")).toBe("qwen3-vl:custom-tag");
  });
});

describe("FAST_MODEL_KEEP_ALIVE", () => {
  it("is 1h by default when OLLAMA_MODEL_KEEP_ALIVE is unset", () => {
    expect(FAST_MODEL_KEEP_ALIVE).toBe("1h");
  });

  // FAST_MODEL_KEEP_ALIVE is a module-level constant, read once at import
  // time (see every call site: chat/route.ts, warm-model/route.ts) rather
  // than a function - vi.resetModules() + a fresh dynamic import is the
  // correct way to exercise that read with the env var actually set,
  // without changing the exported shape every real caller depends on.
  it("reads OLLAMA_MODEL_KEEP_ALIVE when set, e.g. this repo's .env value of 2h", async () => {
    process.env.OLLAMA_MODEL_KEEP_ALIVE = "2h";
    vi.resetModules();
    const fresh = await import("./ollamaClient");
    expect(fresh.FAST_MODEL_KEEP_ALIVE).toBe("2h");
  });
});
