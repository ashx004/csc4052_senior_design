import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveModelFromKey, FAST_MODEL_KEEP_ALIVE } from "./ollamaClient";

const ENV_KEYS = [
  "OLLAMA_MODEL",
  "OLLAMA_MODEL_FAST",
  "OLLAMA_MODEL_QUALITY",
  "OLLAMA_MODEL_MUSE_GLIMMER",
  "OLLAMA_MODEL_NEMOTRON",
  "OLLAMA_MODEL_QWEN_CODER",
  "OLLAMA_OCR_MODEL",
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

  it("falls open to qwen3A3b (the practical default) on an invalid or missing key, never throwing", () => {
    expect(resolveModelFromKey("not-a-real-key")).toBe("qwen3:30b-a3b");
    expect(resolveModelFromKey(undefined)).toBe("qwen3:30b-a3b");
  });

  it("qwen3A3b falls back through OLLAMA_MODEL_QUALITY, then OLLAMA_MODEL, then the literal", () => {
    process.env.OLLAMA_MODEL = "shared-fallback-model";
    expect(resolveModelFromKey("qwen3A3b")).toBe("shared-fallback-model");
    process.env.OLLAMA_MODEL_QUALITY = "qwen3:30b-a3b-custom";
    expect(resolveModelFromKey("qwen3A3b")).toBe("qwen3:30b-a3b-custom");
  });

  it("an invalid key falls open through the same OLLAMA_MODEL_QUALITY/OLLAMA_MODEL chain as qwen3A3b", () => {
    process.env.OLLAMA_MODEL_QUALITY = "qwen3:30b-a3b-custom";
    expect(resolveModelFromKey("not-a-real-key")).toBe("qwen3:30b-a3b-custom");
  });

  it("resolves the internal-only ocr key for co-warming vision alongside fastResident", () => {
    expect(resolveModelFromKey("ocr")).toBe("qwen3-vl:8b");
    process.env.OLLAMA_OCR_MODEL = "qwen3-vl:custom-tag";
    expect(resolveModelFromKey("ocr")).toBe("qwen3-vl:custom-tag");
  });
});

describe("FAST_MODEL_KEEP_ALIVE", () => {
  it("is the always-resident sentinel Ollama expects", () => {
    expect(FAST_MODEL_KEEP_ALIVE).toBe(-1);
  });
});
