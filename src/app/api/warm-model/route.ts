import { NextRequest, NextResponse } from "next/server";
import { resolveOllamaBaseUrl, resolveModelFromKey, FAST_MODEL_KEEP_ALIVE, mainModelContextOption } from "@/src/library/ollamaClient";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { checkRateLimit } from "@/src/library/rateLimit";

const WARM_RATE_LIMIT_WINDOW_MS = 60_000;
const WARM_RATE_LIMIT_MAX = 10; // one toggle click each way, generously

const WARM_TIMEOUT_MS = 120000; // matches OLLAMA_TIMEOUT_MS in api/chat/route.ts — a genuine cold load can take a while

// Both keys resolve to the same model now (see resolveModelFromKey) - Muse
// Glimmer is the only main model, used for chat/quiz/flashcards and for
// OCR/vision alike. "ocr" is kept as a distinct accepted key only so a
// caller can still explicitly ask to warm the OCR path by name.
const VALID_MODEL_KEYS = ["museGlimmer", "ocr"];

// Pre-loads the settings page's currently-effective chat model into VRAM,
// so a change a student makes there pays its cold-boot cost right then
// instead of on their next actual message. Ollama's documented way to load
// a model without generating anything is a /api/chat (or /api/generate)
// call with no messages/prompt — the model loads, the call returns once
// it's resident, and nothing gets billed as a real turn.
export async function POST(request: NextRequest) {
  const auth = await verifyRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = checkRateLimit(auth.uid, WARM_RATE_LIMIT_WINDOW_MS, WARM_RATE_LIMIT_MAX);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const { modelKey } = (await request.json().catch(() => ({}))) as { modelKey?: string };
  // Unlike resolveModelFromKey's own fail-open default (right for the
  // generation routes), this route's whole job is confirming a specific
  // real model gets warmed - silently substituting a different one on bad
  // input would be actively wrong here, so it rejects outright instead.
  if (!modelKey || !VALID_MODEL_KEYS.includes(modelKey)) {
    return NextResponse.json({ error: `modelKey must be one of: ${VALID_MODEL_KEYS.join(", ")}` }, { status: 400 });
  }

  if (!process.env.OLLAMA_PRIMARY_URL || !process.env.OLLAMA_AUTH_TOKEN) {
    return NextResponse.json({ error: "The AI assistant is not configured." }, { status: 500 });
  }

  const model = resolveModelFromKey(modelKey);
  // Always FAST_MODEL_KEEP_ALIVE, not conditional on which key it is - this
  // route's whole purpose is pre-loading the model that's about to become
  // (or already is) the resident AI Chat model, see chat/route.ts.
  const keepAlive = FAST_MODEL_KEEP_ALIVE;

  const baseUrl = await resolveOllamaBaseUrl(process.env.OLLAMA_PRIMARY_URL, process.env.OLLAMA_PRIMARY_FALLBACK_URL);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WARM_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OLLAMA_AUTH_TOKEN}`,
        "X-Catalyst-Feature": "warm-model",
      },
      // No messages — Ollama loads the model into memory and returns
      // immediately once ready, without generating any content. Same
      // num_ctx as every real main-model call, or the first real request
      // after this warm-up would reload the model at a different size.
      body: JSON.stringify({
        model,
        messages: [],
        stream: false,
        keep_alive: keepAlive,
        options: { ...mainModelContextOption() },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(`Model warm-up failed for "${model}" (${response.status}): ${errorText}`);
      return NextResponse.json({ error: "Failed to warm up the model." }, { status: 502 });
    }

    return NextResponse.json({ success: true, model });
  } catch (error) {
    console.error(`Model warm-up error for "${model}":`, error);
    return NextResponse.json({ error: "Failed to warm up the model." }, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
}
