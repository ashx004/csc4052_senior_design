import type { IncidentKind, ServiceId } from "./types";

type RequestKind = Exclude<IncidentKind, "outage">;
type IncidentSink = (service: ServiceId, kind: RequestKind) => Promise<void>;
const runtime = globalThis as typeof globalThis & {
  __catalystIncidentSink?: IncidentSink;
};

export function setIncidentSink(sink: IncidentSink | undefined) {
  runtime.__catalystIncidentSink = sink;
}

export function emitIncident(service: ServiceId, kind: RequestKind) {
  try {
    void runtime.__catalystIncidentSink?.(service, kind).catch(() => {});
  } catch {
    // Monitoring must never break the request it observes.
  }
}

function recordFailure(
  service: ServiceId,
  error: unknown,
  signal?: AbortSignal | null,
) {
  const name = error instanceof Error ? error.name : "";
  const code = (error as { code?: string | number } | null)?.code;
  const reason = signal?.reason;
  const timeout =
    name === "TimeoutError" ||
    code === 4 ||
    code === "ETIMEDOUT" ||
    code === "ESOCKETTIMEDOUT" ||
    reason?.name === "TimeoutError" ||
    (signal?.aborted &&
      reason instanceof Error &&
      /timed out/i.test(reason.message));
  if (timeout) emitIncident(service, "timeout");
  else if (!signal?.aborted && name !== "AbortError")
    emitIncident(service, "request_failure");
}

export async function observeOperation<T>(
  service: ServiceId,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    recordFailure(service, error);
    throw error;
  }
}

export async function monitoredFetch(
  service: ServiceId,
  url: string,
  init: RequestInit,
): Promise<Response> {
  if (!runtime.__catalystIncidentSink) return fetch(url, init);
  const timer =
    service === "ai"
      ? setTimeout(() => emitIncident(service, "slow_generation"), 30_000)
      : undefined;
  timer?.unref?.();
  const stop = () => {
    if (timer) clearTimeout(timer);
  };
  init.signal?.addEventListener("abort", stop, { once: true });
  const cleanup = () => {
    stop();
    init.signal?.removeEventListener("abort", stop);
  };
  try {
    const response = await fetch(url, init);
    if (
      [401, 403, 408, 429].includes(response.status) ||
      response.status >= 500
    ) {
      emitIncident(
        service,
        response.status === 408 || response.status === 504
          ? "timeout"
          : "request_failure",
      );
    }
    if (service !== "ai" || !response.ok || !response.body) {
      cleanup();
      return response;
    }
    const reader = response.body.getReader();
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { value, done } = await reader.read();
          if (done) {
            cleanup();
            controller.close();
          } else controller.enqueue(value);
        } catch (error) {
          cleanup();
          recordFailure(service, error, init.signal);
          controller.error(error);
        }
      },
      cancel(reason) {
        cleanup();
        return reader.cancel(reason);
      },
    });
    return new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    cleanup();
    recordFailure(service, error, init.signal);
    throw error;
  }
}
