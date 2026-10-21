import { monitoredFetch } from "./monitoring/telemetry";
import { resolveOllamaBaseUrl } from "./ollamaClient";

// Server-only: talks to the secondary Ollama box (the embeddings-only GPU).
// Never import this from a client component — OLLAMA_SECONDARY_URL /
// OLLAMA_AUTH_TOKEN are not NEXT_PUBLIC_ and must stay server-side.
// A whole textbook is ~1,000 chunks; one request that size outlasts the
// timeout and holds the GPU, so they go in batches.
const EMBED_BATCH = 64;

export async function embedTexts(texts: string[], signal?: AbortSignal): Promise<number[][]> {
  if (!process.env.OLLAMA_SECONDARY_URL || !process.env.OLLAMA_AUTH_TOKEN || !process.env.OLLAMA_EMBED_MODEL) {
    throw new Error("Embedding service is not configured.");
  }

  const baseUrl = await resolveOllamaBaseUrl(process.env.OLLAMA_SECONDARY_URL, process.env.OLLAMA_SECONDARY_FALLBACK_URL);
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    out.push(...(await embedBatch(baseUrl, texts.slice(i, i + EMBED_BATCH), signal)));
  }
  return out;
}

async function embedBatch(baseUrl: string, texts: string[], signal?: AbortSignal): Promise<number[][]> {
  const response = await monitoredFetch("ai", `${baseUrl}/api/embed`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OLLAMA_AUTH_TOKEN}`,
      "X-Catalyst-Feature": "embeddings",
    },
    signal: signal ?? AbortSignal.timeout(20_000),
    body: JSON.stringify({
      model: process.env.OLLAMA_EMBED_MODEL,
      input: texts,
      // Changed 2026-08-15 from -1 (never unload): an idle model is just GPU
      // power draw with nobody using it. 2h keeps it loaded through a normal
      // burst of indexing/search activity without camping in VRAM forever -
      // same window as FAST_MODEL_KEEP_ALIVE, and overrides the daemon-level
      // OLLAMA_KEEP_ALIVE default (1h as of 2026-08-15).
      keep_alive: "2h",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Embedding request failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (!Array.isArray(data?.embeddings)) {
    throw new Error("Embedding response missing embeddings array.");
  }

  return data.embeddings as number[][];
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
