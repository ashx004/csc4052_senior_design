import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveModelFromKey, FAST_MODEL_KEEP_ALIVE } from "./ollamaClient";

const ENV_KEYS = ["OLLAMA_MODEL_MUSE_GLIMMER"] as const;

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
  it("is the always-resident sentinel Ollama expects", () => {
    expect(FAST_MODEL_KEEP_ALIVE).toBe(-1);
  });
});
