import { resolveOllamaBaseUrl } from "./ollamaClient";

// Server-only: transcribes an image via the OCR-capable Ollama vision model
// already running on the primary box. Never import this from a client
// component — OLLAMA_PRIMARY_URL / OLLAMA_AUTH_TOKEN / OLLAMA_OCR_MODEL are
// not NEXT_PUBLIC_ and must stay server-side.
//
// Uses the same /api/chat endpoint, bearer auth, and `data.message.content`
// response shape as every other model call in this codebase (chat, chunk
// context, student profile, query clarification) — the image is attached on
// the user message via Ollama's `images` array (base64), which vision models
// accept on top of the ordinary text messages.
const OCR_SYSTEM_PROMPT = `You are an OCR engine for college notes. Transcribe ALL handwritten and printed text in the image exactly as written, preserving line breaks and paragraph structure. Do not summarize, interpret, or add anything that is not in the image. Output ONLY the raw transcription — no commentary, no markdown, no explanations.`;

export async function ocrImage(imageBytes: Buffer, signal?: AbortSignal): Promise<string> {
  if (!process.env.OLLAMA_PRIMARY_URL || !process.env.OLLAMA_AUTH_TOKEN || !process.env.OLLAMA_OCR_MODEL) {
    throw new Error("OCR service is not configured.");
  }

  const baseUrl = await resolveOllamaBaseUrl(
    process.env.OLLAMA_PRIMARY_URL,
    process.env.OLLAMA_PRIMARY_FALLBACK_URL
  );

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OLLAMA_AUTH_TOKEN}`,
    },
    signal,
    body: JSON.stringify({
      model: process.env.OLLAMA_OCR_MODEL,
      stream: false,
      options: { temperature: 0.1 },
      messages: [
        { role: "system", content: OCR_SYSTEM_PROMPT },
        {
          role: "user",
          content: "Transcribe the text in this image.",
          images: [imageBytes.toString("base64")],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`OCR request failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const text = (data?.message?.content ?? "").trim();
  if (!text) {
    throw new Error("OCR returned no text.");
  }
  return text;
}
