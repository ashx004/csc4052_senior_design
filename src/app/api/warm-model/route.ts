import { NextRequest, NextResponse } from "next/server";
import { resolveOllamaBaseUrl } from "@/src/library/ollamaClient";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { checkRateLimit } from "@/src/library/rateLimit";

const WARM_RATE_LIMIT_WINDOW_MS = 60_000;
const WARM_RATE_LIMIT_MAX = 10; // one toggle click each way, generously

const WARM_TIMEOUT_MS = 120000; // matches OLLAMA_TIMEOUT_MS in api/chat/route.ts — a genuine cold load can take a while

// Same keep_alive policy as api/chat/route.ts's primaryTarget: fast stays
// resident forever, quality is kept warm for a bounded window past last use
// so it still frees up for OCR/vision once genuinely idle.
const FAST_MODEL_KEEP_ALIVE = -1;
const QUALITY_MODEL_KEEP_ALIVE = "30m";

// Pre-loads the fast or quality chat model into VRAM on the primary Ollama
// box, so the switch a student makes on the Settings page pays its cold-boot
// cost right then instead of on their next actual message. Ollama's
// documented way to load a model without generating anything is a /api/chat
// (or /api/generate) call with no messages/prompt — the model loads, the
// call returns once it's resident, and nothing gets billed as a real turn.
export async function POST(request: NextRequest) {
  const auth = await verifyRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = checkRateLimit(auth.uid, WARM_RATE_LIMIT_WINDOW_MS, WARM_RATE_LIMIT_MAX);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const { mode } = (await request.json().catch(() => ({}))) as { mode?: "fast" | "quality" };
  if (mode !== "fast" && mode !== "quality") {
    return NextResponse.json({ error: "mode must be 'fast' or 'quality'" }, { status: 400 });
  }

  if (!process.env.OLLAMA_PRIMARY_URL || !process.env.OLLAMA_AUTH_TOKEN) {
    return NextResponse.json({ error: "The AI assistant is not configured." }, { status: 500 });
  }

  const useQualityModel = mode === "quality";
  const model = useQualityModel
    ? process.env.OLLAMA_MODEL_QUALITY || process.env.OLLAMA_MODEL || "qwen3:30b-a3b"
    : process.env.OLLAMA_MODEL_FAST || process.env.OLLAMA_MODEL || "gpt-oss:20b";
  const keepAlive = useQualityModel ? QUALITY_MODEL_KEEP_ALIVE : FAST_MODEL_KEEP_ALIVE;

  const baseUrl = await resolveOllamaBaseUrl(process.env.OLLAMA_PRIMARY_URL, process.env.OLLAMA_PRIMARY_FALLBACK_URL);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WARM_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OLLAMA_AUTH_TOKEN}`,
      },
      // No messages — Ollama loads the model into memory and returns
      // immediately once ready, without generating any content.
      body: JSON.stringify({ model, messages: [], stream: false, keep_alive: keepAlive }),
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
