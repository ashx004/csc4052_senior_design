import { afterEach, describe, expect, it, vi } from "vitest";
import { mayLeakThinking, modelAlwaysThinks, resolveThink, thinkField } from "./thinkMode";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveThink", () => {
  it("keeps each feature's pre-existing behavior when its env var is unset", () => {
    vi.stubEnv("OLLAMA_THINK_CHAT", "");
    vi.stubEnv("ADVISING_THINK_MODE", "");
    expect(resolveThink("chat")).toBe(false);
    expect(resolveThink("advising")).toBeUndefined();
  });

  it("maps on/off/omit", () => {
    vi.stubEnv("OLLAMA_THINK_QUIZ", "on");
    vi.stubEnv("OLLAMA_THINK_FLASHCARDS", "OFF");
    vi.stubEnv("OLLAMA_THINK_DISCOVER", "omit");
    expect(resolveThink("quiz")).toBe(true);
    expect(resolveThink("flashcards")).toBe(false);
    expect(resolveThink("discover")).toBeUndefined();
  });

  it("passes the call site's level through for 'levels', and fixed levels as-is", () => {
    vi.stubEnv("ADVISING_THINK_MODE", "levels");
    expect(resolveThink("advising", "high")).toBe("high");
    vi.stubEnv("ADVISING_THINK_MODE", "low");
    expect(resolveThink("advising", "high")).toBe("low");
  });
});

describe("thinkField", () => {
  it("omits the key entirely for 'omit'", () => {
    vi.stubEnv("OLLAMA_THINK_CHAT", "omit");
    expect(thinkField("chat")).toEqual({});
  });

  it("includes false rather than dropping it", () => {
    vi.stubEnv("OLLAMA_THINK_CHAT", "off");
    expect(thinkField("chat")).toEqual({ think: false });
  });
});

describe("mayLeakThinking", () => {
  it("only flags an always-thinking model when thinking wasn't requested", () => {
    vi.stubEnv("OLLAMA_MODELS_ALWAYS_THINK", "qwen3:30b-a3b, other:tag");
    expect(modelAlwaysThinks("qwen3:30b-a3b")).toBe(true);

    vi.stubEnv("OLLAMA_THINK_CHAT", "off");
    expect(mayLeakThinking("chat", "qwen3:30b-a3b")).toBe(true);
    expect(mayLeakThinking("chat", "gemma4:12b")).toBe(false);

    vi.stubEnv("OLLAMA_THINK_CHAT", "on");
    expect(mayLeakThinking("chat", "qwen3:30b-a3b")).toBe(false);
  });
});
