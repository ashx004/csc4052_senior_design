import { resolveOllamaBaseUrl, secondaryContextOption } from "./ollamaClient";
import { createTimeoutSignal } from "./withTimeout";

// Server-only: transcribes an image via a small dedicated vision model
// (OLLAMA_MODEL_OCR) running on the SECONDARY box, not Primary. Deliberately
// split from the main model (previously shared it — one multimodal model
// covering chat, quiz/flashcards, advising, AND OCR): Primary's main model
// alone uses nearly its entire VRAM budget, so any second model call landing
// on Primary evicts it (confirmed empirically — see the qwen3:30b-a3b +
// qwen3-vl:4b coexistence test in the model-selection benchmark). Routing
// OCR to Secondary instead means Primary only ever loads the one main model
// and is never evicted by an incoming OCR request. Never import this from a
// client component — OLLAMA_SECONDARY_URL / OLLAMA_AUTH_TOKEN are not
// NEXT_PUBLIC_ and must stay server-side.
//
// Uses the same /api/chat endpoint, bearer auth, and `data.message.content`
// response shape as every other model call in this codebase (chat, chunk
// context, student profile, query clarification) — the image is attached on
// the user message via Ollama's `images` array (base64), which vision models
// accept on top of the ordinary text messages.
const OCR_SYSTEM_PROMPT = `You are an OCR engine for college notes. Transcribe ALL handwritten and printed text in the image exactly as written, preserving line breaks and paragraph structure. Do not summarize, interpret, or add anything that is not in the image. Output ONLY the raw transcription — no commentary, no markdown, no explanations.`;

// Neither this function nor its only caller (documentExtract.ts's
// extractDocumentText, itself called from embed-document/route.ts before
// that route's own INDEXING_TIMEOUT_MS/AbortSignal even exists yet) ever
// bounded this request — a genuinely stuck/cold-booting vision model could
// hang an upload indefinitely, only ever cut off by an upstream proxy's own
// timeout with a generic, unhelpful error. Enforced here, internally,
// rather than relying on every caller to remember to pass a signal — a
// caller-supplied `signal` (e.g. a future one from extractDocumentText)
// still works too, combined via AbortSignal.any so either one can cancel
// the request.
// Matches OLLAMA_TIMEOUT_MS in chat/route.ts — same "first request after
// idle can take a while to cold-load" allowance, since the vision model is
// no exception to that and 60s proved too tight for a cold boot.
const OCR_TIMEOUT_MS = 120_000;

export async function ocrImage(imageBytes: Buffer, signal?: AbortSignal): Promise<string> {
  if (!process.env.OLLAMA_SECONDARY_URL || !process.env.OLLAMA_AUTH_TOKEN) {
    throw new Error("OCR service is not configured.");
  }
  // Config lives in the env, not in code: no hardcoded model-name fallback —
  // an unset OLLAMA_MODEL_OCR is a deployment error that should surface
  // loudly, not silently fall back to some arbitrary tag (or worse, to the
  // main model, which would defeat the whole point of splitting this out).
  const model = process.env.OLLAMA_MODEL_OCR;
  if (!model) {
    throw new Error("OLLAMA_MODEL_OCR is not configured.");
  }

  const baseUrl = await resolveOllamaBaseUrl(
    process.env.OLLAMA_SECONDARY_URL,
    process.env.OLLAMA_SECONDARY_FALLBACK_URL
  );

  const { signal: timeoutSignal, cancel } = createTimeoutSignal(OCR_TIMEOUT_MS, "OCR transcription");
  const combinedSignal = signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal;

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OLLAMA_AUTH_TOKEN}`,
        "X-Catalyst-Feature": "ocr",
      },
      signal: combinedSignal,
      body: JSON.stringify({
        model,
        stream: false,
        options: { temperature: 0.1, ...secondaryContextOption() },
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
  } catch (error) {
    if (timeoutSignal.aborted) {
      throw new Error(`OCR transcription timed out after ${(OCR_TIMEOUT_MS / 1000).toFixed(0)}s.`);
    }
    throw error;
  } finally {
    cancel();
  }
}
