import "server-only";
import { providerFor } from "../ai/cloudTranslate";
import type { ServiceId, ServiceStatus } from "./types";

const PROBE_TIMEOUT_MS = 5_000;
class NotConfigured extends Error {}

export async function withDeadline<T>(
  operation: Promise<T>,
  milliseconds = PROBE_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("Probe timed out")),
      milliseconds,
    );
  });
  try {
    return await Promise.race([operation, deadline]);
  } finally {
    clearTimeout(timer!);
  }
}

async function readJson(url: string, headers: HeadersInit = {}) {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Probe request failed");
  return response.json();
}

async function withFallback(
  primary: string | undefined,
  fallbacks: string | undefined,
  check: (base: string) => Promise<void>,
): Promise<boolean> {
  if (!primary) throw new NotConfigured();
  const targets = [
    primary,
    ...(fallbacks ?? "").split(",").filter(Boolean),
  ].slice(0, 4);
  for (const [index, target] of targets.entries()) {
    try {
      await check(target.trim().replace(/\/$/, ""));
      return index > 0;
    } catch {
      if (index === targets.length - 1)
        throw new Error("All probe targets failed");
    }
  }
  return false;
}

async function checkOllama(server: "PRIMARY" | "SECONDARY", models: string[]) {
  if (!models.length || !process.env.OLLAMA_AUTH_TOKEN)
    throw new NotConfigured();
  const primary = process.env[`OLLAMA_${server}_URL`];
  const fallbacks = process.env[`OLLAMA_${server}_FALLBACK_URL`];
  if (!primary) throw new NotConfigured();
  const targets = [
    primary,
    ...(fallbacks ?? "").split(",").filter(Boolean),
  ].slice(0, 4);
  const controllers = targets.map(() => new AbortController());
  try {
    await Promise.any(
      targets.map(async (target, index) => {
        const base = target.trim().replace(/\/$/, "");
        const response = await fetch(`${base}/api/tags`, {
          headers: {
            Authorization: `Bearer ${process.env.OLLAMA_AUTH_TOKEN}`,
          },
          signal:
            targets.length === 1
              ? AbortSignal.timeout(PROBE_TIMEOUT_MS)
              : AbortSignal.any([
                  controllers[index].signal,
                  AbortSignal.timeout(PROBE_TIMEOUT_MS),
                ]),
          redirect: "error",
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Probe request failed");
        const data = await response.json();
        const names = (data.models ?? []).map(
          (model: { name: string }) => model.name,
        );
        if (
          !models.every(
            (model) =>
              names.includes(model) || names.includes(`${model}:latest`),
          )
        ) {
          throw new Error("Configured model is unavailable");
        }
      }),
    );
    return false;
  } catch {
    throw new Error("All probe targets failed");
  } finally {
    controllers.forEach((controller) => controller.abort());
  }
}

type OpenRouterCheck = {
  models: Promise<{ data?: { id: string }[] }>;
  key: Promise<unknown>;
};

async function checkCloudModel(
  model: string,
  openRouterCache?: Map<string, OpenRouterCheck>,
) {
  const { provider, modelId } = providerFor(model);
  const key = process.env[provider.keyEnv];
  if (!key) throw new NotConfigured();
  if (provider.name === "google") {
    await readJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}`,
      {
        "x-goog-api-key": key,
      },
    );
  } else {
    let cached = openRouterCache?.get(key);
    if (!cached) {
      const headers = { Authorization: `Bearer ${key}` };
      cached = {
        models: readJson("https://openrouter.ai/api/v1/models", headers),
        key: readJson("https://openrouter.ai/api/v1/key", headers),
      };
      openRouterCache?.set(key, cached);
    }
    const data = await cached.models;
    if (!data.data?.some((entry: { id: string }) => entry.id === modelId))
      throw new Error("Model is unavailable");
    await cached.key;
  }
}

async function checkAi(): Promise<string> {
  const mode = process.env.AI_BACKEND;
  const cloud = mode === "cloud" || mode === "testers";
  const checks: (() => Promise<boolean | void>)[] = [];
  if (cloud) {
    if (!process.env.AI_MODEL_DEFAULT) throw new NotConfigured();
    const openRouterCache = new Map<string, OpenRouterCheck>();
    const primaryKeys = [
      "DEFAULT",
      "GENERATION",
      "OCR",
      "LIGHT",
      "FAST",
      "THOROUGH",
    ];
    const primaryModels = [
      ...new Set(
        primaryKeys
          .flatMap((key) => (process.env[`AI_MODEL_${key}`] ?? "").split(","))
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];
    const fallbackModels = [
      ...new Set(
        (process.env.AI_MODEL_FALLBACK ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter((value) => value && !primaryModels.includes(value)),
      ),
    ];
    checks.push(
      ...primaryModels.map((model) => () =>
        checkCloudModel(model, openRouterCache),
      ),
    );
    checks.push(
      ...fallbackModels.map((model) => async () => {
        try {
          await checkCloudModel(model, openRouterCache);
          return false;
        } catch {
          return true;
        }
      }),
    );
  } else {
    const main = process.env.OLLAMA_MODEL_MAIN;
    if (!main) throw new NotConfigured();
    checks.push(() => checkOllama("PRIMARY", [main]));
  }
  if (!process.env.OLLAMA_EMBED_MODEL) throw new NotConfigured();
  const secondaryModels: (string | undefined)[] = [
    process.env.OLLAMA_EMBED_MODEL,
  ];
  if (!cloud) {
    secondaryModels.push(
      process.env.OLLAMA_MODEL_OCR,
      process.env.OLLAMA_SUMMARY_MODEL,
      process.env.OLLAMA_CLARIFIER_MODEL,
      process.env.OLLAMA_CONTEXT_MODEL,
    );
  }
  checks.push(() =>
    checkOllama(
      "SECONDARY",
      secondaryModels.filter((model): model is string => Boolean(model)),
    ),
  );
  const results = await Promise.all(checks.map((check) => check()));
  return results.includes(true)
    ? "Models reachable through a fallback connection."
    : "Configured model catalogs and credentials are reachable. Generation is checked by real requests.";
}

async function checkVector(): Promise<string> {
  const fallback = await withFallback(
    process.env.QDRANT_URL,
    process.env.QDRANT_FALLBACK_URL,
    async (base) => {
      const response = await fetch(`${base}/readyz`, {
        headers: process.env.QDRANT_API_KEY
          ? { "api-key": process.env.QDRANT_API_KEY }
          : {},
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        redirect: "error",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Vector database not ready");
    },
  );
  return fallback
    ? "Vector database reachable through a fallback connection."
    : "Vector database is ready to accept requests.";
}

async function checkStorage(): Promise<string> {
  if (!process.env.GCS_BUCKET || !process.env.GCS_SERVICE_ACCOUNT_JSON)
    throw new NotConfigured();
  const { getBucket } = await import("../gcsStorage");
  await withDeadline(
    getBucket().getFiles({
      prefix: "__catalyst_health_probe__/",
      maxResults: 1,
      autoPaginate: false,
    }),
  );
  return "File listing is responding. File contents are not accessed.";
}

async function checkFirestore(): Promise<string> {
  if (!process.env.FIREBASE_ADMIN_PROJECT_ID) throw new NotConfigured();
  const { adminDb } = await import("../firebaseAdmin");
  await withDeadline(adminDb.collection("adminMonitoring").doc("probe").get());
  return "Firestore is responding to server reads.";
}

export async function runProbe(
  id: ServiceId,
  check: () => Promise<string>,
): Promise<ServiceStatus> {
  const started = Date.now();
  try {
    const message = await check();
    const latencyMs = Date.now() - started;
    return {
      id,
      checkedAt: new Date().toISOString(),
      latencyMs,
      message,
      status:
        latencyMs > 3000 || message.includes("fallback")
          ? "degraded"
          : "healthy",
    };
  } catch (error) {
    const unconfigured = error instanceof NotConfigured;
    return {
      id,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      status: unconfigured ? "unconfigured" : "down",
      message: unconfigured
        ? "Required server configuration is missing."
        : "Service check failed or timed out. Check the service and its credentials.",
    };
  }
}

export function probeServices() {
  return Promise.all([
    runProbe("ai", checkAi),
    runProbe("vector", checkVector),
    runProbe("storage", checkStorage),
    runProbe("firestore", checkFirestore),
  ]);
}
