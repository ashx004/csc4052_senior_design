import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiFetch, setUsageSink, type UsageEvent } from "./aiFetch";
import { runAsAiUser } from "./usageScope";

const fetchMock = vi.fn();
const events: UsageEvent[] = [];
const ollamaInit = (feature: string, body: Record<string, unknown>) => ({ method: "POST", headers: { "X-Catalyst-Feature": feature }, body: JSON.stringify(body) });
const completion = (content: string, cost?: number) => Response.json({ choices: [{ finish_reason: "stop", message: { content } }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, ...(cost !== undefined ? { cost } : {}) } });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  events.length = 0;
  setUsageSink((e) => events.push(e));
  Object.assign(process.env, {
    AI_BACKEND: "cloud",
    AI_MODEL_DEFAULT: "openrouter:google/gemma-4-26b-a4b-it",
    AI_MODEL_GENERATION: "openrouter:qwen/qwen3.7-flash",
    AI_MODEL_OCR: "openrouter:z-ai/glm-5.3-flash",
    AI_MODEL_FALLBACK: "google:gemini-3.1-flash-lite",
    OPENROUTER_API_KEY: "or-key",
    GOOGLE_AI_API_KEY: "g-key",
  });
});
afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockReset(); delete process.env.AI_BACKEND; });

const sentBody = (call: number) => JSON.parse(fetchMock.mock.calls[call][1].body);

describe("aiFetch", () => {
  it("is plain fetch when the backend is Ollama", async () => {
    delete process.env.AI_BACKEND;
    fetchMock.mockResolvedValue(new Response("ok"));
    await aiFetch("http://ollama/api/chat", ollamaInit("chat", {}));
    expect(fetchMock.mock.calls[0][0]).toBe("http://ollama/api/chat");
  });

  it("routes each feature to its model and caps OCR output with thinking off", async () => {
    fetchMock.mockResolvedValue(completion("text", 0.0001));
    const res = await aiFetch("http://x/api/chat", ollamaInit("ocr", { messages: [{ role: "user", content: "read" }] }));
    expect(sentBody(0)).toMatchObject({ model: "z-ai/glm-5.3-flash", max_tokens: 3000, reasoning: { enabled: false } });
    expect(await res.json()).toMatchObject({ done: true, message: { content: "text" } });
    expect(events[0]).toMatchObject({ feature: "ocr", costMicros: 100, costSource: "provider", fallback: false });
  });

  it("falls back to Gemini when OpenRouter is down, and prices it from the rate table", async () => {
    fetchMock.mockResolvedValueOnce(new Response("down", { status: 503 })).mockResolvedValueOnce(completion("from gemini"));
    const res = await aiFetch("http://x/api/chat", ollamaInit("quiz-generation", { messages: [] }));
    expect(fetchMock.mock.calls[1][0]).toContain("generativelanguage.googleapis.com");
    expect(sentBody(1).model).toBe("gemini-3.1-flash-lite");
    expect((await res.json()).message.content).toBe("from gemini");
    // 100 in at $0.25/M + 20 out at $1.50/M = 25 + 30 micros
    expect(events[0]).toMatchObject({ model: "google:gemini-3.1-flash-lite", costMicros: 55, costSource: "rate-table", fallback: true });
  });

  it("does not fall back after the student pressed Stop", async () => {
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockRejectedValue(new DOMException("aborted", "AbortError"));
    await expect(aiFetch("http://x/api/chat", { ...ollamaInit("chat", {}), signal: controller.signal })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("answers warm-model without calling or billing a provider", async () => {
    const res = await aiFetch("http://x/api/chat", ollamaInit("warm-model", {}));
    expect(res.ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(events).toHaveLength(0);
  });

  it("streams as Ollama NDJSON and reports usage at the end", async () => {
    const sse = ['{"choices":[{"delta":{"content":"Hi"}}]}', '{"choices":[{"finish_reason":"stop","delta":{}}],"usage":{"prompt_tokens":5,"completion_tokens":1,"cost":0.000003}}'].map((d) => `data: ${d}\n\n`).join("") + "data: [DONE]\n\n";
    fetchMock.mockResolvedValue(new Response(sse));
    const res = await aiFetch("http://x/api/chat", ollamaInit("chat", { stream: true, messages: [] }));
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    expect(lines[0].message.content).toBe("Hi");
    expect(lines.at(-1)).toMatchObject({ done: true, prompt_eval_count: 5, eval_count: 1 });
    expect(events[0]).toMatchObject({ feature: "chat", costMicros: 3 });
  });

  it("doesn't hang when no chunk produces a line until the end (tool-call-only stream)", async () => {
    const sse = [
      '{"choices":[{"delta":{"role":"assistant"}}]}',
      '{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"create_note","arguments":"{}"}}]}}]}',
      '{"choices":[{"finish_reason":"tool_calls","delta":{}}]}',
    ].map((d) => `data: ${d}\n\n`);
    // One network chunk per event, as a real provider delivers them.
    const body = new ReadableStream({ start(c) { for (const e of sse) c.enqueue(new TextEncoder().encode(e)); c.close(); } });
    fetchMock.mockResolvedValue(new Response(body));
    const res = await aiFetch("http://x/api/chat", ollamaInit("chat", { stream: true, messages: [] }));
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(1);
    expect(lines[0].message.tool_calls[0].function.name).toBe("create_note");
  });

  it("bills the student whose route started the request, with the provider's request id", async () => {
    fetchMock.mockImplementation(async () => Response.json({ id: "gen-1", choices: [{ message: { content: "x" } }], usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.000001 } }));
    await runAsAiUser("student-a", () => aiFetch("http://x/api/chat", ollamaInit("quiz-generation", { messages: [] })));
    await aiFetch("http://x/api/chat", ollamaInit("quiz-generation", { messages: [] }));
    expect(events[0]).toMatchObject({ uid: "student-a", requestId: "gen-1" });
    expect(events[1].uid).toBeUndefined();
  });

  it("keeps the student on a stream read after the route's scope is gone", async () => {
    const sse = '{"id":"gen-2","choices":[{"delta":{"content":"Hi"}}]}\n\n';
    fetchMock.mockResolvedValue(new Response(`data: ${sse}data: {"choices":[{"finish_reason":"stop","delta":{}}],"usage":{"prompt_tokens":1,"completion_tokens":1,"cost":0.000001}}\n\n`));
    const res = await runAsAiUser("student-b", () => aiFetch("http://x/api/chat", ollamaInit("chat", { stream: true, messages: [] })));
    await res.text();
    expect(events).toEqual([expect.objectContaining({ uid: "student-b", requestId: "gen-2", costMicros: 1 })]);
    expect(events[0].incomplete).toBeUndefined();
  });

  it("reports a stopped stream once, as incomplete, so its real cost can be looked up", async () => {
    const body = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: {"id":"gen-3","choices":[{"delta":{"content":"Hi"}}]}\n\n')); } });
    fetchMock.mockResolvedValue(new Response(body));
    const res = await runAsAiUser("student-c", () => aiFetch("http://x/api/chat", ollamaInit("chat", { stream: true, messages: [] })));
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();
    expect(events).toEqual([expect.objectContaining({ uid: "student-c", requestId: "gen-3", incomplete: true })]);
  });

  it("in testers mode sends only listed accounts to the cloud", async () => {
    process.env.AI_BACKEND = "testers";
    process.env.AI_CLOUD_TESTERS = "tester-1, tester-2";
    fetchMock.mockImplementation(async () => completion("x", 0.000001));
    await runAsAiUser("tester-2", () => aiFetch("http://ollama/api/chat", ollamaInit("chat", { messages: [] })));
    await runAsAiUser("student-z", () => aiFetch("http://ollama/api/chat", ollamaInit("chat", { messages: [] })));
    await aiFetch("http://ollama/api/chat", ollamaInit("chat", { messages: [] }));
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(["https://openrouter.ai/api/v1/chat/completions", "http://ollama/api/chat", "http://ollama/api/chat"]);
    expect(events).toHaveLength(1);
    delete process.env.AI_CLOUD_TESTERS;
  });
});
