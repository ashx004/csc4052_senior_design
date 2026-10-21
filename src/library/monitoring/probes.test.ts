import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { probeServices, runProbe, withDeadline } from "./probes";
const storage = vi.hoisted(() => ({ getMetadata: vi.fn() }));
const firestore = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../gcsStorage", () => ({ getBucket: () => storage }));
vi.mock("../firebaseAdmin", () => ({
  adminDb: { collection: () => ({ doc: () => firestore }) },
}));
const fetchMock = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  for (const name of [
    "AI_BACKEND",
    "OLLAMA_AUTH_TOKEN",
    "OLLAMA_MODEL_MAIN",
    "OLLAMA_EMBED_MODEL",
    "AI_OLLAMA_USERS",
    "QDRANT_URL",
    "GCS_BUCKET",
    "GCS_SERVICE_ACCOUNT_JSON",
    "FIREBASE_ADMIN_PROJECT_ID",
  ])
    vi.stubEnv(name, "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("reports unconfigured services rather than claiming they are healthy", async () => {
  const result = await probeServices();
  expect(result.map((service) => service.status)).toEqual([
    "unconfigured",
    "unconfigured",
    "unconfigured",
    "unconfigured",
  ]);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("bounds SDK reads and returns sanitized failure details", async () => {
  vi.useFakeTimers();
  const result = runProbe("firestore", () =>
    withDeadline(new Promise(() => {})),
  );
  await vi.advanceTimersByTimeAsync(5001);
  expect(await result).toMatchObject({ id: "firestore", status: "down" });
  const failure = await runProbe("storage", async () => {
    throw new Error("secret host and credentials");
  });
  expect(JSON.stringify(failure)).not.toContain("secret");
});

it("detects slow successful probes as degraded", async () => {
  vi.useFakeTimers();
  const result = runProbe("vector", async () => {
    await new Promise((resolve) => setTimeout(resolve, 3500));
    return "Ready";
  });
  await vi.advanceTimersByTimeAsync(3501);
  expect(await result).toMatchObject({ status: "degraded", latencyMs: 3500 });
});

it("probes configured models, vector readiness, storage and Firestore without paid generation", async () => {
  for (const [name, value] of Object.entries({
    AI_BACKEND: "ollama",
    OLLAMA_AUTH_TOKEN: "test-token",
    OLLAMA_MODEL_MAIN: "main",
    OLLAMA_EMBED_MODEL: "embed",
    OLLAMA_PRIMARY_URL: "http://primary",
    OLLAMA_SECONDARY_URL: "http://secondary",
    QDRANT_URL: "http://vector",
    GCS_BUCKET: "bucket",
    GCS_SERVICE_ACCOUNT_JSON: "{}",
    FIREBASE_ADMIN_PROJECT_ID: "project",
  }))
    vi.stubEnv(name, value);
  fetchMock.mockImplementation(async (url: string) =>
    url.endsWith("/readyz")
      ? new Response("ready")
      : Response.json({ models: [{ name: "main" }, { name: "embed" }] }),
  );
  storage.getMetadata.mockResolvedValue([{}]);
  firestore.get.mockResolvedValue({});
  const result = await probeServices();
  expect(result.every((service) => service.status === "healthy")).toBe(true);
  expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(
    expect.arrayContaining([
      "http://primary/api/tags",
      "http://secondary/api/tags",
      "http://vector/readyz",
    ]),
  );
  expect(fetchMock.mock.calls.every((call) => call[1].method !== "POST")).toBe(
    true,
  );
});

it("marks a fallback vector connection as degraded, not a full outage", async () => {
  vi.stubEnv("QDRANT_URL", "http://primary");
  vi.stubEnv("QDRANT_FALLBACK_URL", "http://fallback");
  fetchMock
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(new Response("ready"));
  expect(
    (await probeServices()).find((service) => service.id === "vector"),
  ).toMatchObject({ status: "degraded" });
});

it("checks cloud model metadata and credentials while still checking Ollama embeddings", async () => {
  for (const [name, value] of Object.entries({
    AI_BACKEND: "cloud",
    AI_MODEL_DEFAULT: "google:gemini-example",
    AI_MODEL_FALLBACK: "openrouter:vendor/model",
    GOOGLE_AI_API_KEY: "google-test-key",
    OPENROUTER_API_KEY: "router-test-key",
    OLLAMA_AUTH_TOKEN: "ollama-test-key",
    OLLAMA_EMBED_MODEL: "embed",
    OLLAMA_SECONDARY_URL: "http://secondary",
  }))
    vi.stubEnv(name, value);
  fetchMock.mockImplementation(async (url: string) => {
    if (url.endsWith("/api/tags"))
      return Response.json({ models: [{ name: "embed" }] });
    if (url.endsWith("/api/v1/models"))
      return Response.json({ data: [{ id: "vendor/model" }] });
    return Response.json({});
  });
  const ai = (await probeServices()).find((service) => service.id === "ai");
  expect(ai?.status).toBe("healthy");
  expect(fetchMock).toHaveBeenCalledWith(
    "https://openrouter.ai/api/v1/key",
    expect.objectContaining({
      headers: { Authorization: "Bearer router-test-key" },
      redirect: "error",
    }),
  );
  expect(fetchMock.mock.calls.every((call) => call[1].method !== "POST")).toBe(
    true,
  );
  expect(JSON.stringify(ai)).not.toContain("test-key");
  vi.stubEnv("OLLAMA_EMBED_MODEL", "");
  expect(
    (await probeServices()).find((service) => service.id === "ai")?.status,
  ).toBe("unconfigured");
});
