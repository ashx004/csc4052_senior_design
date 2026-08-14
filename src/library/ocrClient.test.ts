import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ocrImage } from "./ocrClient";

const IMAGE_BYTES = Buffer.from("fake-image-bytes");

function stubFetch(overrides: { ok?: boolean; status?: number; json?: unknown; text?: string }) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: overrides.ok ?? true,
      status: overrides.status ?? 200,
      json: async () => overrides.json ?? {},
      text: async () => overrides.text ?? "",
    })
  );
}

describe("ocrImage", () => {
  beforeEach(() => {
    vi.stubEnv("OLLAMA_PRIMARY_URL", "http://localhost:11434");
    vi.stubEnv("OLLAMA_AUTH_TOKEN", "test-token");
    vi.stubEnv("OLLAMA_OCR_MODEL", "moondream:latest");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("posts the image to /api/chat and returns the trimmed transcription", async () => {
    stubFetch({ ok: true, json: { message: { content: "  Handwritten notes\nfor Calculus  \n" } } });

    const text = await ocrImage(IMAGE_BYTES);

    expect(text).toBe("Handwritten notes\nfor Calculus");
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:11434/api/chat");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer test-token" });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("moondream:latest");
    expect(body.stream).toBe(false);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1].images[0]).toBe(IMAGE_BYTES.toString("base64"));
  });

  it("throws when the model responds with an error status", async () => {
    stubFetch({ ok: false, status: 500, text: "model exploded" });

    await expect(ocrImage(IMAGE_BYTES)).rejects.toThrow("OCR request failed (500): model exploded");
  });

  it("throws when the model returns no text", async () => {
    stubFetch({ ok: true, json: { message: { content: "" } } });

    await expect(ocrImage(IMAGE_BYTES)).rejects.toThrow("OCR returned no text.");
  });

  it("throws when the service isn't configured", async () => {
    vi.stubEnv("OLLAMA_OCR_MODEL", "");

    await expect(ocrImage(IMAGE_BYTES)).rejects.toThrow("OCR service is not configured.");
  });

  it("times out with a clear message if the request hangs, instead of waiting forever", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        // Mirrors real fetch's own abort behavior — never resolves on its
        // own, only rejects once the combined signal actually fires.
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            const err = new Error("This operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      })
    );

    const promise = ocrImage(IMAGE_BYTES);
    const assertion = expect(promise).rejects.toThrow("OCR transcription timed out after 120s.");
    await vi.advanceTimersByTimeAsync(120_000);
    await assertion;

    vi.useRealTimers();
  });
});
