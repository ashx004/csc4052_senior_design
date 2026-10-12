import { afterEach, describe, expect, it, vi } from "vitest";
import { mayLeakThinking, modelAlwaysThinks, resolveChatThinking, resolveThink, thinkField } from "./thinkMode";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveThink", () => {
  it("keeps each feature's pre-existing behavior when its env var is unset", () => {
    vi.stubEnv("OLLAMA_THINK_CHAT", "");
    vi.stubEnv("ADVISING_THINK_MODE", "");
    expect(resolveThink("quiz")).toBe(false);
    expect(resolveThink("advising")).toBeUndefined();
  });

  it("leaves chat to the router by default (no fixed value)", () => {
    vi.stubEnv("OLLAMA_THINK_CHAT", "");
    expect(resolveThink("chat")).toBeUndefined();
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

describe("resolveChatThinking", () => {
  it("always thinks on an always-thinking model, capping the budget only for the fast tier", () => {
    vi.stubEnv("OLLAMA_THINK_CHAT", "auto");
    vi.stubEnv("OLLAMA_MODELS_ALWAYS_THINK", "qwen3:30b-a3b");
    const fast = resolveChatThinking("fast", "qwen3:30b-a3b");
    expect(fast.think).toBe(true);
    expect(fast.effortHint).toMatch(/one sentence/);
    expect(resolveChatThinking("standard", "qwen3:30b-a3b")).toEqual({ think: true, effortHint: undefined });
    expect(resolveChatThinking("deep", "qwen3:30b-a3b")).toEqual({ think: true, effortHint: undefined });
  });

  it("turns thinking off for the fast tier on a hybrid model", () => {
    vi.stubEnv("OLLAMA_THINK_CHAT", "");
    vi.stubEnv("OLLAMA_MODELS_ALWAYS_THINK", "qwen3:30b-a3b");
    expect(resolveChatThinking("fast", "gemma4:12b")).toEqual({ think: false });
    expect(resolveChatThinking("standard", "gemma4:12b")).toEqual({ think: true });
    expect(resolveChatThinking("deep", "gemma4:12b")).toEqual({ think: true });
  });

  it("maps tiers to levels for level models", () => {
    vi.stubEnv("OLLAMA_THINK_CHAT", "auto");
    vi.stubEnv("OLLAMA_MODELS_THINK_LEVELS", "gpt-oss:20b");
    expect(resolveChatThinking("fast", "gpt-oss:20b")).toEqual({ think: "low" });
    expect(resolveChatThinking("standard", "gpt-oss:20b")).toEqual({ think: "medium" });
    expect(resolveChatThinking("deep", "gpt-oss:20b")).toEqual({ think: "high" });
  });

  it("lets an explicit OLLAMA_THINK_CHAT override the router", () => {
    vi.stubEnv("OLLAMA_MODELS_ALWAYS_THINK", "qwen3:30b-a3b");
    vi.stubEnv("OLLAMA_THINK_CHAT", "on");
    expect(resolveChatThinking("fast", "qwen3:30b-a3b")).toEqual({ think: true });
    vi.stubEnv("OLLAMA_THINK_CHAT", "off");
    expect(resolveChatThinking("deep", "gemma4:12b")).toEqual({ think: false });
    vi.stubEnv("OLLAMA_THINK_CHAT", "omit");
    expect(resolveChatThinking("deep", "gemma4:12b")).toEqual({});
  });

  it("never needs leak-stripping in auto mode", () => {
    vi.stubEnv("OLLAMA_THINK_CHAT", "auto");
    vi.stubEnv("OLLAMA_MODELS_ALWAYS_THINK", "qwen3:30b-a3b");
    expect(mayLeakThinking("chat", "qwen3:30b-a3b")).toBe(false);
  });
});
