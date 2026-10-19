/** Local Ollama-protocol proxy for benchmarking hosted models.
 *
 * Every Catalyst feature talks to `${baseUrl}/api/chat` in Ollama's format
 * (structuredGeneration.ts, advisingOllama.ts, the benchmark's own calls), so
 * pointing OLLAMA_PRIMARY_URL at this shim runs the real generators unchanged
 * against an OpenAI-compatible provider. The model tag picks the provider:
 * "openrouter:z-ai/glm-4.7-flash", "groq:openai/gpt-oss-120b",
 * "google:gemini-2.5-flash-lite".
 *
 * Spend is guarded here, not trusted to the caller: every call is appended to
 * a persistent ledger, and a call is refused (HTTP 402) when its worst case
 * (input estimate + max_tokens at the output rate) would push the total past
 * the budget, or one model past its own cap.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { appendFileSync, existsSync, readFileSync } from "node:fs";

type Provider = { url: string; keyEnv: string };
const PROVIDERS: Record<string, Provider> = {
  openrouter: { url: "https://openrouter.ai/api/v1/chat/completions", keyEnv: "OPENROUTER_API_KEY" },
  groq: { url: "https://api.groq.com/openai/v1/chat/completions", keyEnv: "GROQ_API_KEY" },
  google: { url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", keyEnv: "GOOGLE_AI_API_KEY" },
};

// USD per 1M tokens, checked 2026-10-18 against console.groq.com/docs/models and
// ai.google.dev/gemini-api/docs/pricing (Gemini output includes thinking).
// OpenRouter rates come from its live /models API at startup instead.
const RATES: Record<string, { input: number; output: number }> = {
  "groq:openai/gpt-oss-120b": { input: 0.15, output: 0.6 },
  "groq:openai/gpt-oss-20b": { input: 0.075, output: 0.3 },
  // gemini-2.5-flash-lite ($0.10/$0.40) 404s for new API keys: "no longer available to new users".
  "google:gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
  "google:gemini-3.1-flash-lite": { input: 0.25, output: 1.5 },
  "google:gemini-3.8-flash": { input: 0.75, output: 3.75 },
};

const DEFAULT_MAX_TOKENS = 8192;

type LedgerEntry = { at: string; model: string; feature: string; inputTokens: number; outputTokens: number; costUsd: number; costSource: string; seconds: number; status: number; error?: string };

export type ShimOptions = { ledgerPath: string; budgetUsd: number; perModelBudgetUsd: number; port?: number };

export async function startCloudShim(options: ShimOptions): Promise<{ url: string; close: () => void }> {
  await loadOpenRouterRates();
  const ledger: LedgerEntry[] = existsSync(options.ledgerPath)
    ? readFileSync(options.ledgerPath, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))
    : [];
  const spent = (model?: string) => ledger.filter((e) => !model || e.model === model).reduce((n, e) => n + e.costUsd, 0);

  const server = createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url?.startsWith("/api/tags")) return json(res, 200, { models: [] });
      if (req.method === "GET" && req.url?.startsWith("/_bench/spend")) {
        const model = new URL(req.url, "http://x").searchParams.get("model") || undefined;
        const rows = ledger.filter((e) => !model || e.model === model);
        return json(res, 200, { totalUsd: spent(), modelUsd: spent(model), calls: rows.length, inputTokens: sum(rows, "inputTokens"), outputTokens: sum(rows, "outputTokens") });
      }
      if (req.method !== "POST" || !req.url?.startsWith("/api/chat")) return json(res, 404, { error: "not found" });

      const body = JSON.parse(await readBody(req));
      const model = String(body.model || "");
      const rate = rateFor(model);
      if (!rate) return json(res, 400, { error: `No verified rate for ${model}; add it before spending.` });

      const maxTokens = Number(body.options?.num_predict) > 0 ? Number(body.options.num_predict) : DEFAULT_MAX_TOKENS;
      const worstCase = (estimateTokens(body.messages) * rate.input + maxTokens * rate.output) / 1e6;
      if (spent() + worstCase > options.budgetUsd || spent(model) + worstCase > options.perModelBudgetUsd) {
        return json(res, 402, { error: `Budget guard: spent $${spent().toFixed(4)} total, $${spent(model).toFixed(4)} on ${model}; next call could cost $${worstCase.toFixed(4)}.` });
      }

      const started = Date.now();
      const { status, data } = await callProvider(model, body, maxTokens);
      const seconds = (Date.now() - started) / 1000;
      const usage = data?.usage ?? {};
      const inputTokens = Number(usage.prompt_tokens || 0);
      // total - prompt counts reasoning tokens even where a provider leaves them out of completion_tokens.
      const outputTokens = Math.max(Number(usage.completion_tokens || 0), Number(usage.total_tokens || 0) - inputTokens);
      const reported = typeof usage.cost === "number" ? usage.cost : null;
      const entry: LedgerEntry = {
        at: new Date().toISOString(), model, feature: String(req.headers["x-catalyst-feature"] || "benchmark"),
        inputTokens, outputTokens, costUsd: reported ?? (inputTokens * rate.input + outputTokens * rate.output) / 1e6,
        costSource: reported !== null ? "provider" : "rate-table", seconds, status,
        ...(status >= 400 ? { error: JSON.stringify(data?.error ?? data).slice(0, 300) } : {}),
      };
      ledger.push(entry);
      appendFileSync(options.ledgerPath, JSON.stringify(entry) + "\n");

      if (status >= 400) return json(res, status, { error: JSON.stringify(data?.error ?? data).slice(0, 500) });
      const ollama = toOllama(model, data, inputTokens, outputTokens, seconds);
      if (body.stream) {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        return res.end(JSON.stringify(ollama) + "\n");
      }
      return json(res, 200, ollama);
    } catch (error) {
      return json(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port;
  return { url: `http://127.0.0.1:${port}`, close: () => server.close() };
}

const openRouterRates = new Map<string, { input: number; output: number }>();
async function loadOpenRouterRates() {
  if (openRouterRates.size) return;
  const response = await fetch("https://openrouter.ai/api/v1/models");
  const data: any = await response.json();
  for (const m of data.data ?? []) openRouterRates.set(m.id, { input: Number(m.pricing.prompt) * 1e6, output: Number(m.pricing.completion) * 1e6 });
}

export function rateFor(model: string) {
  if (model.startsWith("openrouter:")) return openRouterRates.get(model.slice("openrouter:".length));
  return RATES[model];
}

async function callProvider(model: string, body: any, maxTokens: number): Promise<{ status: number; data: any }> {
  const [prefix, ...rest] = model.split(":");
  const provider = PROVIDERS[prefix];
  if (!provider) throw new Error(`Unknown provider prefix in ${model}`);
  const key = process.env[provider.keyEnv];
  if (!key) throw new Error(`${provider.keyEnv} is not set`);

  const request: any = {
    model: rest.join(":"),
    messages: (body.messages ?? []).map(toOpenAiMessage),
    max_tokens: maxTokens,
    ...(body.options?.temperature !== undefined ? { temperature: body.options.temperature } : {}),
    ...(body.tools?.length ? { tools: body.tools } : {}),
    ...responseFormat(body.format),
    ...reasoningFields(prefix, body.think),
  };

  // A 400 is not billed, so a provider rejecting a reasoning or schema option
  // gets one retry without the reasoning option, then JSON mode, then no format.
  // Error text can't pick the culprit: Gemini says only "invalid argument".
  let attempt = await post(provider.url, key, request);
  for (const fallback of [dropReasoning, toJsonObject, dropFormat]) {
    if (attempt.status !== 400) break;
    const next = fallback(request);
    if (!next) continue;
    attempt = await post(provider.url, key, next);
  }
  return attempt;
}

// Free tiers rate-limit (429) and busy models shed load (503); neither is
// billed, so wait (Retry-After when given, capped at 60s) and try again.
async function post(url: string, key: string, request: unknown) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "X-Title": "Catalyst model benchmark" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(300_000),
    });
    const text = await response.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 500) }; }
    if (![429, 503].includes(response.status) || attempt >= 4) return { status: response.status, data };
    const retryAfter = Number(response.headers.get("retry-after"));
    await new Promise((r) => setTimeout(r, Math.min(60_000, retryAfter > 0 ? retryAfter * 1000 : 5000 * 2 ** attempt)));
  }
}

function dropReasoning(request: any) {
  if (!("reasoning" in request || "reasoning_effort" in request)) return null;
  delete request.reasoning;
  delete request.reasoning_effort;
  return request;
}
function toJsonObject(request: any) {
  if (request.response_format?.type !== "json_schema") return null;
  request.response_format = { type: "json_object" };
  return request;
}
function dropFormat(request: any) {
  if (!request.response_format) return null;
  delete request.response_format;
  return request;
}

function responseFormat(format: unknown) {
  if (!format) return {};
  if (format === "json") return { response_format: { type: "json_object" } };
  return { response_format: { type: "json_schema", json_schema: { name: "catalyst_output", schema: format, strict: false } } };
}

// Ollama's think is true/false or "low" | "medium" | "high".
function reasoningFields(prefix: string, think: unknown) {
  if (think === undefined) return {};
  const effort = typeof think === "string" ? think : think ? "medium" : "low";
  if (prefix === "openrouter") return { reasoning: think === false ? { enabled: false } : { effort } };
  if (prefix === "google") return { reasoning_effort: think === false ? "none" : effort };
  return { reasoning_effort: effort }; // groq gpt-oss cannot switch reasoning off
}

function toOpenAiMessage(message: any) {
  const { thinking, images, ...rest } = message;
  // Ollama sends images as bare base64 beside the text; OpenAI wants content parts.
  if (images?.length) {
    rest.content = [
      { type: "text", text: rest.content ?? "" },
      ...images.map((b64: string) => ({ type: "image_url", image_url: { url: `data:${b64.startsWith("/9j/") ? "image/jpeg" : "image/png"};base64,${b64}` } })),
    ];
  }
  if (rest.tool_calls) {
    rest.tool_calls = rest.tool_calls.map((call: any, i: number) => ({
      id: call.id || `call_${i}`, type: "function",
      function: { name: call.function?.name, arguments: typeof call.function?.arguments === "string" ? call.function.arguments : JSON.stringify(call.function?.arguments ?? {}) },
    }));
  }
  return rest;
}

function toOllama(model: string, data: any, inputTokens: number, outputTokens: number, seconds: number) {
  const choice = data?.choices?.[0] ?? {};
  const message = choice.message ?? {};
  const toolCalls = (message.tool_calls ?? []).map((call: any) => ({
    function: { name: call.function?.name, arguments: parseArguments(call.function?.arguments) },
  }));
  return {
    model, created_at: new Date().toISOString(), done: true,
    done_reason: choice.finish_reason === "length" ? "length" : "stop",
    message: { role: "assistant", content: message.content ?? "", thinking: message.reasoning ?? message.reasoning_content ?? "", ...(toolCalls.length ? { tool_calls: toolCalls } : {}) },
    prompt_eval_count: inputTokens, eval_count: outputTokens,
    // Wall time, including network: tok/s here is end-to-end, not GPU speed.
    eval_duration: Math.round(seconds * 1e9),
  };
}

function parseArguments(value: unknown) {
  if (typeof value !== "string") return value ?? {};
  try { return JSON.parse(value); } catch { return {}; }
}

// ~4 characters per token, rounded up; only used for the worst-case guard.
// Images count as a flat allowance (providers bill a few hundred to a few
// thousand tokens per image), not by their base64 length.
const TOKENS_PER_IMAGE = 5000;
function estimateTokens(messages: any[] = []) {
  const images = messages.reduce((n, m) => n + (m.images?.length ?? 0), 0);
  const text = JSON.stringify(messages.map(({ images, ...m }) => m));
  return Math.ceil(text.length / 4) + 500 + images * TOKENS_PER_IMAGE;
}

function sum(rows: LedgerEntry[], key: "inputTokens" | "outputTokens") { return rows.reduce((n, e) => n + e[key], 0); }
function json(res: ServerResponse, status: number, body: unknown) { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); }
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => resolve(s)); req.on("error", reject); });
}
