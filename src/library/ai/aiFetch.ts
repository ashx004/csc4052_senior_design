import { fallbackModel, featureGroup, isCloudBackend, modelForFeature, outputCap } from "./cloudModels";
import { rateFor } from "./cloudRates";
import { StreamTranslator, buildCloudRequest, fromCompletion, readUsage, relaxRequest, type OllamaChatBody, type Provider, type Usage } from "./cloudTranslate";

// Drop-in for fetch(`${ollamaBaseUrl}/api/chat`, init). With AI_BACKEND=ollama
// (or unset) it IS fetch. With AI_BACKEND=cloud it sends the same request to
// the feature's cloud model and answers in Ollama's format, streamed or not,
// so every caller's parsing stays exactly as it was. The base URL is ignored
// in cloud mode; the model comes from the feature (cloudModels.ts).

export type UsageEvent = { feature: string; model: string; inputTokens: number; outputTokens: number; costMicros: number; costSource: "provider" | "rate-table" | "unknown"; rateId?: string; fallback: boolean };

// Usage sink. Log-only until the wallet is switched on: one greppable line per
// request, so real costs can be compared with the provider dashboards first.
let usageSink: (event: UsageEvent) => void = (event) => console.info(`[ai-usage] ${JSON.stringify(event)}`);
export function setUsageSink(sink: (event: UsageEvent) => void) { usageSink = sink; }

export async function aiFetch(url: string, init: RequestInit): Promise<Response> {
  if (!isCloudBackend() || !url.replace(/\/$/, "").endsWith("/api/chat")) return fetch(url, init);

  const feature = new Headers(init.headers).get("X-Catalyst-Feature") || "chat";
  const body = JSON.parse(String(init.body ?? "{}")) as OllamaChatBody;

  // Cloud models are always loaded; warming one up would just bill a reply nobody reads.
  if (feature === "warm-model") return Response.json({ model: "cloud", message: { role: "assistant", content: "" }, done: true, done_reason: "stop" });

  const primary = modelForFeature(feature);
  const backup = fallbackModel();
  // OCR transcribes, it doesn't reason: thinking only burned tokens in the benchmark.
  const think = featureGroup(feature) === "ocr" ? false : undefined;
  const maxTokens = outputCap(feature);

  let attempt = await callProvider(primary, body, maxTokens, think, init.signal);
  let model = primary;
  if (shouldFallBack(attempt, init.signal) && backup && backup !== primary) {
    console.warn(`[ai] ${primary} failed for ${feature} (${attempt.response?.status ?? attempt.error}); retrying on ${backup}.`);
    attempt = await callProvider(backup, body, maxTokens, think, init.signal);
    model = backup;
  }
  if (attempt.error) throw attempt.error;
  const response = attempt.response!;
  if (!response.ok) return new Response(JSON.stringify({ error: (await response.text()).slice(0, 500) }), { status: response.status, headers: { "Content-Type": "application/json" } });

  const started = attempt.started;
  const report = (usage: Usage) => usageSink(toUsageEvent(feature, model, usage, model !== primary));

  if (!body.stream) {
    const data = await response.json();
    report(readUsage(data.usage));
    return Response.json(fromCompletion(model, data, (performance.now() - started) / 1000));
  }

  const translator = new StreamTranslator(model);
  const encoder = new TextEncoder();
  const upstream = response.body!.getReader();
  const decoder = new TextDecoder();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        // Keep reading until something is enqueued: many SSE chunks (role-only
        // deltas, tool-call fragments, keep-alives) yield no line, and a pull
        // that enqueues nothing is never called again, which hangs the reader.
        for (;;) {
          const { done, value } = await upstream.read();
          if (done) {
            for (const line of translator.push(decoder.decode() + "\n\n")) controller.enqueue(encoder.encode(line + "\n"));
            controller.enqueue(encoder.encode(translator.finish((performance.now() - started) / 1000) + "\n"));
            report(translator.usage);
            controller.close();
            return;
          }
          const lines = translator.push(decoder.decode(value, { stream: true }));
          for (const line of lines) controller.enqueue(encoder.encode(line + "\n"));
          if (lines.length) return;
        }
      } catch (error) {
        // Ollama reports mid-stream failures as an {"error"} line; callers already handle that.
        report(translator.usage);
        controller.enqueue(encoder.encode(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) + "\n"));
        controller.close();
      }
    },
    cancel(reason) { return upstream.cancel(reason); },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "application/x-ndjson" } });
}

type Attempt = { response?: Response; error?: unknown; started: number };

async function callProvider(model: string, body: OllamaChatBody, maxTokens: number, think: OllamaChatBody["think"], signal?: AbortSignal | null): Promise<Attempt> {
  const started = performance.now();
  try {
    const { provider, payload } = buildCloudRequest(body, { model, maxTokens, think });
    let request: Record<string, unknown> | null = payload;
    let response = await post(provider, request, signal);
    // 400s are unbilled; a provider rejecting an option gets the relaxed variants in turn.
    while (response.status === 400 && (request = relaxRequest(request))) response = await post(provider, request, signal);
    return { response, started };
  } catch (error) {
    return { error, started };
  }
}

function post(provider: Provider, payload: Record<string, unknown>, signal?: AbortSignal | null) {
  const key = process.env[provider.keyEnv];
  if (!key) throw new Error(`${provider.keyEnv} is not configured.`);
  return fetch(provider.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "X-Title": "Catalyst" },
    body: JSON.stringify(payload),
    signal: signal ?? undefined,
  });
}

// Fall back when the provider is unreachable, overloaded or erroring, never
// when the student pressed Stop or the caller's own deadline passed.
function shouldFallBack(attempt: Attempt, signal?: AbortSignal | null): boolean {
  if (signal?.aborted) return false;
  if (attempt.error) return true;
  const status = attempt.response?.status ?? 0;
  return status === 408 || status === 429 || status >= 500;
}

function toUsageEvent(feature: string, model: string, usage: Usage, fallback: boolean): UsageEvent {
  if (usage.costUsd !== null) return { feature, model, ...counts(usage), costMicros: Math.ceil(usage.costUsd * 1e6), costSource: "provider", fallback };
  const rate = rateFor(model);
  if (!rate) return { feature, model, ...counts(usage), costMicros: 0, costSource: "unknown", fallback };
  return { feature, model, ...counts(usage), costMicros: Math.ceil(usage.inputTokens * rate.inputPerM + usage.outputTokens * rate.outputPerM), costSource: "rate-table", rateId: rate.id, fallback };
}

function counts(usage: Usage) { return { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }; }
