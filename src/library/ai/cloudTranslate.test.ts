import { describe, expect, it } from "vitest";
import { StreamTranslator, buildCloudRequest, fromCompletion, relaxRequest } from "./cloudTranslate";

const sse = (...chunks: unknown[]) => chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";

describe("buildCloudRequest", () => {
  it("maps an Ollama request to OpenRouter with the no-training rule and usage accounting", () => {
    const { provider, payload } = buildCloudRequest(
      { messages: [{ role: "user", content: "hi", images: ["/9j/abc"] }], format: { type: "object" }, think: false, options: { temperature: 0 } },
      { model: "openrouter:z-ai/glm-5.3-flash", maxTokens: 3000 }
    );
    expect(provider.name).toBe("openrouter");
    expect(payload).toMatchObject({
      model: "z-ai/glm-5.3-flash",
      max_tokens: 3000,
      temperature: 0,
      reasoning: { enabled: false },
      provider: { data_collection: "deny" },
      usage: { include: true },
      response_format: { type: "json_schema" },
    });
    expect((payload.messages as { content: unknown[] }[])[0].content[1]).toEqual({ type: "image_url", image_url: { url: "data:image/jpeg;base64,/9j/abc" } });
  });

  it("keeps a caller's num_predict and gives tool calls stable ids", () => {
    const { payload } = buildCloudRequest(
      { messages: [{ role: "assistant", content: "", tool_calls: [{ function: { name: "create_note", arguments: { title: "x" } } }] }], options: { num_predict: 9000 } },
      { model: "google:gemini-3.1-flash-lite", maxTokens: 4096 }
    );
    expect(payload.max_tokens).toBe(9000);
    expect((payload.messages as { tool_calls: unknown[] }[])[0].tool_calls[0]).toEqual({ id: "call_0_0", type: "function", function: { name: "create_note", arguments: '{"title":"x"}' } });
    expect(payload).not.toHaveProperty("provider");
  });

  it("rejects a model without a provider prefix", () => {
    expect(() => buildCloudRequest({}, { model: "qwen3:30b", maxTokens: 1 })).toThrow(/openrouter: or google:/);
  });
});

describe("relaxRequest", () => {
  it("drops reasoning, then relaxes the schema, then drops the format", () => {
    let p: Record<string, unknown> | null = { model: "m", reasoning_effort: "none", response_format: { type: "json_schema" } };
    p = relaxRequest(p)!; expect(p).not.toHaveProperty("reasoning_effort");
    p = relaxRequest(p)!; expect(p.response_format).toEqual({ type: "json_object" });
    p = relaxRequest(p)!; expect(p).not.toHaveProperty("response_format");
    expect(relaxRequest(p)).toBeNull();
  });
});

describe("responses in Ollama's shape", () => {
  it("converts a completion, including tool calls and reported cost", () => {
    const out = fromCompletion("m", { choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ id: "c1", function: { name: "f", arguments: '{"a":1}' } }] } }], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 15 } }, 1);
    expect(out).toMatchObject({ done: true, done_reason: "stop", prompt_eval_count: 10, eval_count: 5, message: { content: "", tool_calls: [{ id: "c1", function: { name: "f", arguments: { a: 1 } } }] } });
  });

  it("reports a cut-off reply as done_reason length", () => {
    expect(fromCompletion("m", { choices: [{ finish_reason: "length", message: { content: "part" } }] }, 1).done_reason).toBe("length");
  });

  it("streams content and reasoning, and assembles fragmented tool calls into the final line", () => {
    const t = new StreamTranslator("m");
    const text = sse(
      { choices: [{ delta: { reasoning: "think" } }] },
      { choices: [{ delta: { content: "Hel" } }] },
      { choices: [{ delta: { content: "lo" } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "create_", arguments: '{"ti' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { name: "note", arguments: 'tle":"Q"}' } }] }, finish_reason: "tool_calls" }] },
      { choices: [], usage: { prompt_tokens: 7, completion_tokens: 3, cost: 0.00002 } }
    );
    // Split mid-event to prove partial SSE frames are buffered.
    const lines = [...t.push(text.slice(0, 40)), ...t.push(text.slice(40))].map((l) => JSON.parse(l));
    expect(lines.map((l) => l.message.thinking || l.message.content)).toEqual(["think", "Hel", "lo"]);
    const last = JSON.parse(t.finish(2));
    expect(last).toMatchObject({ done: true, prompt_eval_count: 7, eval_count: 3, message: { tool_calls: [{ id: "c1", function: { name: "create_note", arguments: { title: "Q" } } }] } });
    expect(t.usage.costUsd).toBe(0.00002);
  });

  it("passes a provider error through as Ollama's error line", () => {
    const t = new StreamTranslator("m");
    expect(t.push(sse({ error: { message: "overloaded" } }))).toEqual(['{"error":"overloaded"}']);
  });
});
