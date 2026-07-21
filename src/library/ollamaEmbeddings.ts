// Server-only: talks to the secondary Ollama box (the embeddings-only GPU).
// Never import this from a client component — OLLAMA_SECONDARY_URL /
// OLLAMA_AUTH_TOKEN are not NEXT_PUBLIC_ and must stay server-side.
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!process.env.OLLAMA_SECONDARY_URL || !process.env.OLLAMA_AUTH_TOKEN) {
    throw new Error("Embedding service is not configured.");
  }

  const response = await fetch(`${process.env.OLLAMA_SECONDARY_URL}/api/embed`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OLLAMA_AUTH_TOKEN}`,
    },
    body: JSON.stringify({
      model: process.env.OLLAMA_EMBED_MODEL || "qwen3-embedding:latest",
      input: texts,
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
