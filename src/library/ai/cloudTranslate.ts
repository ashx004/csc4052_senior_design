// Pure translation between Ollama's /api/chat format, which every Catalyst
// call site speaks, and the OpenAI-compatible chat completions format that
// OpenRouter and Google's Gemini endpoint accept. Network code is in aiFetch.ts.

type OllamaToolCall = { id?: string; function?: { name?: string; arguments?: unknown } };
type OllamaMessage = { role: string; content?: string; thinking?: string; images?: string[]; tool_calls?: OllamaToolCall[]; tool_call_id?: string; tool_name?: string };
export type OllamaChatBody = {
  model?: string;
  messages?: OllamaMessage[];
  tools?: unknown[];
  stream?: boolean;
  think?: boolean | "low" | "medium" | "high";
  format?: unknown;
  options?: { temperature?: number; num_predict?: number };
};

export type Provider = { name: "openrouter" | "google"; url: string; keyEnv: string };
const PROVIDERS: Record<string, Provider> = {
  openrouter: { name: "openrouter", url: "https://openrouter.ai/api/v1/chat/completions", keyEnv: "OPENROUTER_API_KEY" },
  google: { name: "google", url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", keyEnv: "GOOGLE_AI_API_KEY" },
};

export function providerFor(model: string): { provider: Provider; modelId: string } {
  const [prefix, ...rest] = model.split(":");
  const provider = PROVIDERS[prefix];
  if (!provider || !rest.length) throw new Error(`Cloud model "${model}" must start with openrouter: or google:.`);
  return { provider, modelId: rest.join(":") };
}

function toOpenAiMessage(message: OllamaMessage, index: number) {
  const { thinking, images, tool_name, ...rest } = message;
  void thinking; void tool_name; // Ollama-only fields; reasoning is never sent back to a provider
  const out: Record<string, unknown> = { ...rest };
  if (images?.length) {
    out.content = [
      { type: "text", text: rest.content ?? "" },
      ...images.map((b64) => ({ type: "image_url", image_url: { url: `data:${b64.startsWith("/9j/") ? "image/jpeg" : "image/png"};base64,${b64}` } })),
    ];
  }
  if (rest.tool_calls) {
    out.tool_calls = rest.tool_calls.map((call, i) => ({
      id: call.id || `call_${index}_${i}`,
      type: "function",
      function: { name: call.function?.name, arguments: typeof call.function?.arguments === "string" ? call.function.arguments : JSON.stringify(call.function?.arguments ?? {}) },
    }));
  }
  return out;
}

function responseFormat(format: unknown) {
  if (!format) return {};
  if (format === "json") return { response_format: { type: "json_object" } };
  return { response_format: { type: "json_schema", json_schema: { name: "catalyst_output", schema: format, strict: false } } };
}

// Ollama's think is true/false or "low" | "medium" | "high".
function reasoningFields(provider: Provider["name"], think: OllamaChatBody["think"]) {
  if (think === undefined) return {};
  const effort = typeof think === "string" ? think : think ? "medium" : "low";
  if (provider === "openrouter") return { reasoning: think === false ? { enabled: false } : { effort } };
  return { reasoning_effort: think === false ? "none" : effort };
}

export function buildCloudRequest(body: OllamaChatBody, options: { model: string; maxTokens: number; think?: OllamaChatBody["think"] }) {
  const { provider, modelId } = providerFor(options.model);
  const payload: Record<string, unknown> = {
    model: modelId,
    messages: (body.messages ?? []).map(toOpenAiMessage),
    // A caller's own num_predict wins (advising sizes it to the schedule); otherwise the feature's cap.
    max_tokens: body.options?.num_predict && body.options.num_predict > 0 ? body.options.num_predict : options.maxTokens,
    stream: Boolean(body.stream),
    ...(body.options?.temperature !== undefined ? { temperature: body.options.temperature } : {}),
    ...(body.tools?.length ? { tools: body.tools } : {}),
    ...responseFormat(body.format),
    ...reasoningFields(provider.name, options.think !== undefined ? options.think : body.think),
  };
  if (provider.name === "openrouter") {
    // Only hosts that don't train on prompts (docs/legal/privacy-policy.md), and the exact cost back.
    payload.provider = { data_collection: "deny" };
    payload.usage = { include: true };
  } else if (body.stream) {
    payload.stream_options = { include_usage: true };
  }
  return { provider, payload };
}

/**
 * Retry variants for a 400 (unbilled): drop the reasoning option, then relax a
 * JSON schema to JSON mode, then drop the format. Gemini rejects unsupported
 * options with a bare "invalid argument", so the error text can't pick one.
 */
export function relaxRequest(payload: Record<string, unknown>): Record<string, unknown> | null {
  if ("reasoning" in payload || "reasoning_effort" in payload) {
    const { reasoning, reasoning_effort, ...rest } = payload;
    void reasoning; void reasoning_effort;
    return rest;
  }
  const format = payload.response_format as { type?: string } | undefined;
  if (format?.type === "json_schema") return { ...payload, response_format: { type: "json_object" } };
  if (format) {
    const { response_format, ...rest } = payload;
    void response_format;
    return rest;
  }
  return null;
}

type OpenAiToolCall = { id?: string; index?: number; function?: { name?: string; arguments?: string } };
export type Usage = { inputTokens: number; outputTokens: number; costUsd: number | null };

export function readUsage(usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number } | undefined): Usage {
  const inputTokens = Number(usage?.prompt_tokens ?? 0);
  // total - prompt includes reasoning tokens even where completion_tokens leaves them out.
  const outputTokens = Math.max(Number(usage?.completion_tokens ?? 0), Number(usage?.total_tokens ?? 0) - inputTokens);
  return { inputTokens, outputTokens, costUsd: typeof usage?.cost === "number" ? usage.cost : null };
}

function parseArguments(value: unknown) {
  if (typeof value !== "string") return value ?? {};
  try { return JSON.parse(value); } catch { return {}; }
}

function toOllamaToolCalls(calls: OpenAiToolCall[] | undefined) {
  return (calls ?? []).map((call) => ({ id: call.id, function: { name: call.function?.name, arguments: parseArguments(call.function?.arguments) } }));
}

function finalChunk(model: string, finishReason: string | undefined, usage: Usage, seconds: number, message: Record<string, unknown>) {
  return {
    model,
    created_at: new Date().toISOString(),
    message: { role: "assistant", content: "", ...message },
    done: true,
    done_reason: finishReason === "length" ? "length" : "stop",
    prompt_eval_count: usage.inputTokens,
    eval_count: usage.outputTokens,
    // Wall time including network, so callers' tok/s logging reads end-to-end speed.
    eval_duration: Math.round(seconds * 1e9),
  };
}

/** A non-streamed completion as Ollama's single JSON reply. */
export function fromCompletion(model: string, data: { choices?: { finish_reason?: string; message?: { content?: string | null; reasoning?: string | null; reasoning_content?: string | null; tool_calls?: OpenAiToolCall[] } }[]; usage?: Parameters<typeof readUsage>[0] }, seconds: number) {
  const choice = data.choices?.[0];
  const toolCalls = toOllamaToolCalls(choice?.message?.tool_calls);
  return finalChunk(model, choice?.finish_reason, readUsage(data.usage), seconds, {
    content: choice?.message?.content ?? "",
    thinking: choice?.message?.reasoning ?? choice?.message?.reasoning_content ?? "",
    ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
  });
}

/**
 * Turns a provider's SSE stream into Ollama's NDJSON stream: content and
 * reasoning deltas as `done:false` lines as they arrive, and tool calls,
 * which OpenAI streams as argument fragments, assembled whole in the final
 * `done:true` line, the way Ollama delivers them.
 */
export class StreamTranslator {
  private buffer = "";
  private toolCalls: OpenAiToolCall[] = [];
  private finishReason: string | undefined;
  usage: Usage = { inputTokens: 0, outputTokens: 0, costUsd: null };

  constructor(private model: string) {}

  /** Feeds raw SSE text; returns the NDJSON lines it completes. */
  push(text: string): string[] {
    this.buffer += text;
    const events = this.buffer.split(/\r?\n\r?\n/);
    this.buffer = events.pop() ?? "";
    return events.flatMap((event) => this.handleEvent(event));
  }

  private handleEvent(event: string): string[] {
    const data = event.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
    if (!data || data === "[DONE]") return [];
    let chunk: { error?: { message?: string }; usage?: Parameters<typeof readUsage>[0]; choices?: { finish_reason?: string | null; delta?: { content?: string | null; reasoning?: string | null; reasoning_content?: string | null; tool_calls?: OpenAiToolCall[] } }[] };
    try { chunk = JSON.parse(data); } catch { return []; }
    if (chunk.error) return [JSON.stringify({ error: chunk.error.message ?? "AI provider error" })];
    if (chunk.usage) this.usage = readUsage(chunk.usage);
    const lines: string[] = [];
    for (const choice of chunk.choices ?? []) {
      if (choice.finish_reason) this.finishReason = choice.finish_reason;
      const delta = choice.delta ?? {};
      const thinking = delta.reasoning ?? delta.reasoning_content;
      if (thinking) lines.push(JSON.stringify({ model: this.model, message: { role: "assistant", content: "", thinking }, done: false }));
      if (delta.content) lines.push(JSON.stringify({ model: this.model, message: { role: "assistant", content: delta.content }, done: false }));
      for (const part of delta.tool_calls ?? []) {
        const i = part.index ?? this.toolCalls.length;
        const call = (this.toolCalls[i] ??= { function: { name: "", arguments: "" } });
        if (part.id) call.id = part.id;
        if (part.function?.name) call.function!.name = (call.function!.name ?? "") + part.function.name;
        if (part.function?.arguments) call.function!.arguments = (call.function!.arguments ?? "") + part.function.arguments;
      }
    }
    return lines;
  }

  /** The closing `done:true` line, once the provider's stream has ended. */
  finish(seconds: number): string {
    const toolCalls = toOllamaToolCalls(this.toolCalls.filter(Boolean));
    return JSON.stringify(finalChunk(this.model, this.finishReason, this.usage, seconds, toolCalls.length ? { tool_calls: toolCalls } : {}));
  }
}
