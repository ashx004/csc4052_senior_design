import { monitoredFetch } from "../monitoring/telemetry";
import { fallbackModels, featureGroup, isCloudBackend, modelForFeature, outputCap, speedOverride } from "./cloudModels";
import { rateFor } from "./cloudRates";
import { currentAiScope } from "./usageScope";
import { chargeForCost, estimateInputTokens, holdFor } from "../billing/pricing";
import { StreamTranslator, buildCloudRequest, fromCompletion, readUsage, relaxRequest, type OllamaChatBody, type Provider, type Usage } from "./cloudTranslate";

// Drop-in for fetch(`${ollamaBaseUrl}/api/chat`, init). With AI_BACKEND=ollama
// (or unset) it IS fetch. With AI_BACKEND=cloud it sends the same request to
// the feature's cloud model and answers in Ollama's format, streamed or not,
// so every caller's parsing stays exactly as it was. The base URL is ignored
// in cloud mode; the model comes from the feature (cloudModels.ts).

/** ok: finished. incomplete: the stream ended before usage arrived (billed). error: the request failed. */
export type AiStatus = "ok" | "incomplete" | "error";
/** Coarse failure class only. Never provider or error message text: it can hold student content. */
export type ErrorKind = "timeout" | "rate_limit" | "provider_error" | "network" | "aborted" | "unknown";
/**
 * Where a request's time went, in ms, all >= 0. durationMs is the whole call
 * from aiFetch entry, failed fallback attempts included. waitMs/genMs/deliverMs
 * describe the attempt that answered and are null when not measured
 * (non-streamed, or a stream that sent no content).
 * Streams: waitMs = attempt start to first content line, genMs = first to last
 * content line, deliverMs = last content line to our stream closing, so the
 * three never overlap. overheadMs = the rest of durationMs (our parsing and
 * translating, plus time lost on failed attempts). Non-streams: overheadMs =
 * durationMs minus the answering attempt's round trip (start to headers).
 */
export type Timings = {
  durationMs: number;
  overheadMs: number;
  waitMs: number | null;
  genMs: number | null;
  deliverMs: number | null;
};

export type UsageEvent = { uid?: string; requestId?: string; status: AiStatus; timings: Timings; httpStatus?: number; errorKind?: ErrorKind; feature: string; model: string; inputTokens: number; outputTokens: number; costMicros: number; costSource: "provider" | "rate-table" | "unknown"; rateId?: string; fallback: boolean };

// Metering: billing/usageMeter.ts holds credit before each request and
// charges it after (or only records it, in the dry run). The server registers
// it at startup (src/instrumentation.ts) rather than this module importing it:
// browser pages import modules that import this one, and the meter is
// server-only. Kept on globalThis because Next.js can load this module more
// than once. Tests register their own.
export type MeterSession = { finish(event: UsageEvent): Promise<void>; abandon(event?: UsageEvent): Promise<void> };
export type Meter = {
  start(request: { uid?: string; feature: string; holdMicros: number }): Promise<MeterSession>;
  /** Records a finished request that was never metered (local Ollama: free, no hold, no wallet). */
  record?(event: UsageEvent): Promise<void>;
};

const meterSlot = globalThis as typeof globalThis & { __catalystAiMeter?: Meter | null };
function getMeter(): Meter {
  // No meter means no way to charge: refuse rather than hand out free AI.
  if (!meterSlot.__catalystAiMeter) throw new Error("AI usage meter is not registered (src/instrumentation.ts).");
  return meterSlot.__catalystAiMeter;
}
export function setMeter(next: Meter | null) { meterSlot.__catalystAiMeter = next; }
/** Test helper: a meter that only hands each finished request to `sink`. */
export function setUsageSink(sink: (event: UsageEvent) => void) {
  setMeter({ start: async () => ({ finish: async (event) => sink(event), abandon: async (event) => { if (event) sink(event); } }), record: async (event) => sink(event) });
}

/** The answer a route gets when the student's balance can't cover a request. Ollama-shaped, like every other error here. */
export const OUT_OF_CREDIT_MESSAGE = "You're out of AI credit. Add credit to keep using AI features.";
function outOfCredit(): Response {
  return new Response(JSON.stringify({ error: OUT_OF_CREDIT_MESSAGE, code: "insufficient_credit" }), { status: 402, headers: { "Content-Type": "application/json" } });
}

export async function aiFetch(url: string, init: RequestInit): Promise<Response> {
  if (!isCloudBackend() || !url.replace(/\/$/, "").endsWith("/api/chat")) return localFetch(url, init);

  // What the student waited: includes any failed attempt before the one that answered.
  const callStart = performance.now();
  const feature = new Headers(init.headers).get("X-Catalyst-Feature") || "chat";
  // Read now: a stream's later chunks may run outside the route's async scope.
  const scope = currentAiScope();
  const uid = scope.uid;
  const body = JSON.parse(String(init.body ?? "{}")) as OllamaChatBody;

  // Cloud models are always loaded; warming one up would just bill a reply nobody reads.
  if (feature === "warm-model") return Response.json({ model: "cloud", message: { role: "assistant", content: "" }, done: true, done_reason: "stop" });

  const speed = speedOverride(feature, scope.speed);
  const primary = speed.model ?? modelForFeature(feature);
  const backups = fallbackModels(primary);
  // OCR transcribes, it doesn't reason: thinking only burned tokens in the benchmark.
  const think = featureGroup(feature) === "ocr" ? false : speed.think;
  const maxTokens = outputCap(feature) * (speed.maxTokensFactor ?? 1);

  // Hold the most this request could cost, on whichever model may serve it.
  const models = [primary, ...backups];
  const outputLimit = body.options?.num_predict && body.options.num_predict > 0 ? body.options.num_predict : maxTokens;
  let session: MeterSession;
  try {
    session = await getMeter().start({ uid, feature, holdMicros: holdFor(models, estimateInputTokens(body), outputLimit) });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "InsufficientCreditError") return outOfCredit();
    if (name === "UnattributedAiError") console.error(`[billing] refused unattributed ${feature} request: its route never called enterAiUser().`);
    throw error;
  }

  let attempt = await callProvider(primary, body, maxTokens, think, init.signal);
  let model = primary;
  for (const backup of backups) {
    if (!shouldFallBack(attempt, init.signal)) break;
    console.warn(`[ai] ${model} failed for ${feature} (${attempt.response?.status ?? attempt.error}); retrying on ${backup}.`);
    attempt = await callProvider(backup, body, maxTokens, think, init.signal);
    model = backup;
  }
  // Failed requests aren't billed by the provider, so the hold goes back untouched.
  if (attempt.error) {
    await session.abandon(failureEvent({ uid, feature, model, fallback: model !== primary, callStart, errorKind: classifyThrown(attempt.error, init.signal) }));
    throw attempt.error;
  }
  const response = attempt.response!;
  if (!response.ok) {
    await session.abandon(failureEvent({ uid, feature, model, fallback: model !== primary, callStart, httpStatus: response.status, errorKind: classifyHttp(response.status) }));
    return new Response(JSON.stringify({ error: (await response.text()).slice(0, 500) }), { status: response.status, headers: { "Content-Type": "application/json" } });
  }

  const { started, responded } = attempt;
  const marks: StreamMarks = { firstContent: null, lastContent: null };
  let reported = false;
  // incomplete: the stream ended before the provider sent usage (Stop, or a
  // dropped connection), yet it bills what was written. The requestId lets the
  // real cost be looked up afterwards (scripts/usageReport.mts).
  const report = (usage: Usage, requestId?: string, incomplete = false) => {
    if (reported) return;
    reported = true;
    const timings = stageTimings(callStart, started, responded, performance.now(), marks);
    const event = toUsageEvent(feature, model, usage, model !== primary, incomplete ? "incomplete" : "ok", timings);
    // What the chat route shows as this reply's cost. An unknown cost (a
    // stopped stream) is filled in later by the meter, so it counts 0 here.
    if (scope.spend) {
      scope.spend.micros += chargeForCost(event.costMicros, model);
      scope.spend.uid ??= uid;
      if (feature === "chat") scope.spend.chatModel = model;
    }
    session.finish({ uid, ...(requestId ? { requestId } : {}), ...event })
      .catch((error) => console.error("[billing] metering failed:", error));
  };

  if (!body.stream) {
    let data;
    try {
      data = await response.json();
    } catch (error) {
      // Cut off mid-body: billed, but with no usage to read.
      report({ inputTokens: 0, outputTokens: 0, costUsd: null }, undefined, true);
      throw error;
    }
    report(readUsage(data.usage), data.id);
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
            const tail = translator.push(decoder.decode() + "\n\n");
            markContent(marks, tail.length);
            for (const line of tail) controller.enqueue(encoder.encode(line + "\n"));
            controller.enqueue(encoder.encode(translator.finish((performance.now() - started) / 1000) + "\n"));
            report(translator.usage, translator.requestId);
            controller.close();
            return;
          }
          const lines = translator.push(decoder.decode(value, { stream: true }));
          markContent(marks, lines.length);
          for (const line of lines) controller.enqueue(encoder.encode(line + "\n"));
          if (lines.length) return;
        }
      } catch (error) {
        // Cloud: a mid-stream failure is "incomplete" (not "error") because the request was already billed; local below records "error" since nothing is billed.
        // Ollama reports mid-stream failures as an {"error"} line; callers already handle that.
        report(translator.usage, translator.requestId, true);
        controller.enqueue(encoder.encode(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) + "\n"));
        controller.close();
      }
    },
    cancel(reason) {
      report(translator.usage, translator.requestId, true);
      return upstream.cancel(reason);
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "application/x-ndjson" } });
}

// Local Ollama: free and unmetered, so no hold, no wallet, and no meter is
// required. The finished event goes to meter.record when one is registered
// and is silently dropped otherwise. Telemetry never fails or slows the call.
async function localFetch(url: string, init: RequestInit): Promise<Response> {
  const callStart = performance.now();
  const feature = new Headers(init.headers).get("X-Catalyst-Feature") || "chat";
  const scope = currentAiScope();
  const { model, stream } = readLocalBody(init.body);
  const emit = (status: AiStatus, extra: { httpStatus?: number; errorKind?: ErrorKind } = {}) => {
    try {
      const durationMs = ms(performance.now() - callStart);
      const event: UsageEvent = {
        ...(scope.uid ? { uid: scope.uid } : {}),
        status,
        timings: { durationMs, overheadMs: durationMs, waitMs: null, genMs: null, deliverMs: null },
        ...(extra.httpStatus !== undefined ? { httpStatus: extra.httpStatus } : {}),
        ...(extra.errorKind ? { errorKind: extra.errorKind } : {}),
        feature, model: `ollama:${model}`, inputTokens: 0, outputTokens: 0, costMicros: 0, costSource: "unknown", fallback: false,
      };
      meterSlot.__catalystAiMeter?.record?.(event)?.catch(() => {});
    } catch { /* telemetry must never break a local call */ }
  };

  let response: Response;
  try {
    response = await monitoredFetch("ai", url, init);
  } catch (error) {
    emit("error", { errorKind: classifyThrown(error, init.signal) });
    throw error;
  }
  if (!response.ok) {
    emit("error", { httpStatus: response.status, errorKind: classifyHttp(response.status) });
    return response;
  }
  if (!stream || !response.body) {
    emit("ok");
    return response;
  }

  // Streamed: the row is written when the stream ends, fails or is cancelled.
  const upstream = response.body.getReader();
  let reported = false;
  const once = (status: AiStatus, extra?: { errorKind?: ErrorKind }) => { if (!reported) { reported = true; emit(status, extra); } };
  const wrapped = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await upstream.read();
        if (done) { once("ok"); controller.close(); return; }
        controller.enqueue(value);
      } catch (error) {
        // Local backend: free, so a mid-stream failure is a plain "error" (the cloud path records "incomplete" because it was billed).
        once("error", { errorKind: classifyThrown(error, init.signal) });
        controller.error(error);
      }
    },
    cancel(reason) {
      once("incomplete");
      return upstream.cancel(reason);
    },
  });
  return new Response(wrapped, { status: response.status, statusText: response.statusText, headers: response.headers });
}

function readLocalBody(body: RequestInit["body"]): { model: string; stream: boolean } {
  try {
    if (typeof body !== "string") return { model: "unknown", stream: false };
    const parsed = JSON.parse(body) as { model?: unknown; stream?: unknown } | null;
    return { model: typeof parsed?.model === "string" && parsed.model ? parsed.model : "unknown", stream: parsed?.stream === true };
  } catch {
    return { model: "unknown", stream: false };
  }
}

type Attempt = { response?: Response; error?: unknown; started: number; responded: number };

type StreamMarks = { firstContent: number | null; lastContent: number | null };

function markContent(marks: StreamMarks, lineCount: number) {
  if (!lineCount) return;
  const now = performance.now();
  marks.firstContent ??= now;
  marks.lastContent = now;
}

const ms = (n: number) => Math.max(0, Math.round(n));

// callStart: when aiFetch was entered (durationMs). started/responded: the
// attempt that answered (the stages). Time on failed attempts before it falls
// into overheadMs.
function stageTimings(callStart: number, started: number, responded: number, end: number, marks: StreamMarks): Timings {
  const durationMs = ms(end - callStart);
  const { firstContent, lastContent } = marks;
  if (firstContent === null || lastContent === null) {
    return { durationMs, overheadMs: ms(durationMs - (responded - started)), waitMs: null, genMs: null, deliverMs: null };
  }
  const waitMs = ms(firstContent - started);
  const genMs = ms(lastContent - firstContent);
  const deliverMs = ms(end - lastContent);
  return { durationMs, overheadMs: ms(durationMs - (waitMs + genMs + deliverMs)), waitMs, genMs, deliverMs };
}

async function callProvider(model: string, body: OllamaChatBody, maxTokens: number, think: OllamaChatBody["think"], signal?: AbortSignal | null): Promise<Attempt> {
  const started = performance.now();
  try {
    const { provider, payload } = buildCloudRequest(body, { model, maxTokens, think });
    let request: Record<string, unknown> | null = payload;
    let response = await post(provider, request, signal);
    // 400s are unbilled; a provider rejecting an option gets the relaxed variants in turn.
    while (response.status === 400 && (request = relaxRequest(request))) response = await post(provider, request, signal);
    return { response, started, responded: performance.now() };
  } catch (error) {
    return { error, started, responded: performance.now() };
  }
}

function post(provider: Provider, payload: Record<string, unknown>, signal?: AbortSignal | null) {
  const key = process.env[provider.keyEnv];
  if (!key) throw new Error(`${provider.keyEnv} is not configured.`);
  return monitoredFetch("ai", provider.url, {
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

// A failed request: unbilled, no tokens. Only the coarse kind and the numeric
// status are kept, never the error's message (it can hold student content).
function failureEvent(f: { uid?: string; feature: string; model: string; fallback: boolean; callStart: number; httpStatus?: number; errorKind: ErrorKind }): UsageEvent {
  const durationMs = ms(performance.now() - f.callStart);
  return {
    ...(f.uid ? { uid: f.uid } : {}),
    status: "error",
    timings: { durationMs, overheadMs: durationMs, waitMs: null, genMs: null, deliverMs: null },
    ...(f.httpStatus !== undefined ? { httpStatus: f.httpStatus } : {}),
    errorKind: f.errorKind,
    feature: f.feature, model: f.model, inputTokens: 0, outputTokens: 0, costMicros: 0, costSource: "unknown", fallback: f.fallback,
  };
}

function classifyHttp(status: number): ErrorKind {
  if (status === 408) return "timeout";
  if (status === 429) return "rate_limit";
  return "provider_error";
}

function classifyThrown(error: unknown, signal?: AbortSignal | null): ErrorKind {
  const name = error instanceof Error ? error.name : "";
  if (name === "AbortError" || signal?.aborted) return "aborted";
  if (name === "TimeoutError") return "timeout";
  if (error instanceof TypeError) return "network"; // fetch rejects with TypeError when it cannot reach the host
  return "unknown";
}

function toUsageEvent(feature: string, model: string, usage: Usage, fallback: boolean, status: AiStatus, timings: Timings): UsageEvent {
  const base = { feature, model, status, timings };
  if (usage.costUsd !== null) return { ...base, ...counts(usage), costMicros: Math.ceil(usage.costUsd * 1e6), costSource: "provider", fallback };
  const rate = rateFor(model);
  if (!rate) return { ...base, ...counts(usage), costMicros: 0, costSource: "unknown", fallback };
  return { ...base, ...counts(usage), costMicros: Math.ceil(usage.inputTokens * rate.inputPerM + usage.outputTokens * rate.outputPerM), costSource: "rate-table", rateId: rate.id, fallback };
}

function counts(usage: Usage) { return { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }; }
