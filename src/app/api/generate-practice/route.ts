import { NextRequest, NextResponse } from "next/server";
import { resolveOllamaBaseUrl } from "@/src/library/ollamaClient";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { enterAiUser } from "@/src/library/ai/usageScope";
import { aiCreditGate } from "@/src/library/billing/creditGate";
import { checkRateLimit } from "@/src/library/rateLimit";
import { acquireSlot } from "@/src/library/concurrencyLimit";
import { getDocumentText } from "@/src/library/documentTextCache";
import { generatePractice, MAX_PRACTICE_ITEMS } from "@/src/library/practice/generation";
import { PRACTICE_KINDS, type DragDropMode, type PracticeDifficulty, type PracticeKind } from "@/src/library/practice/types";
import { refundOnFailure } from "@/src/library/billing/refundOnFailure";
import { parseConceptFocus } from "@/src/library/generation/conceptFocus";

// Generates a practice set (fill in the blank, word problems or drag and drop)
// from one of the student's own documents. Same shape and safeguards as
// api/generate-quiz: signed in, rate limited, and the document must be theirs.

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
const MAX_DOCUMENT_CHARS = 50_000;
// A practice set can hold a model slot for up to two minutes; the same few
// slots serve everyone's chat, so only so many may generate at once.
const MAX_PER_STUDENT = 1;
const MAX_SITE_WIDE = Number(process.env.PRACTICE_MAX_CONCURRENT) > 0 ? Number(process.env.PRACTICE_MAX_CONCURRENT) : 3;
const DIFFICULTIES: PracticeDifficulty[] = ["review", "exam", "challenge"];
const MODES: DragDropMode[] = ["match", "categorize", "sequence"];

function documentKey(docUrl: string): string | null {
  try {
    return new URL(docUrl, "http://internal").searchParams.get("key");
  } catch {
    return null;
  }
}

async function handlePOST(request: NextRequest) {
  try {
    const auth = await verifyRequestAuth(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    enterAiUser(auth.uid);
    const outOfCredit = await aiCreditGate(auth.uid);
    if (outOfCredit) return outOfCredit;

    const limit = checkRateLimit(`practice-generate:${auth.uid}`, RATE_WINDOW_MS, RATE_MAX);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many practice sets being generated at once - please wait a moment." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }

    const body = await request.json().catch(() => null);
    const { docUrl, docName, kind, count, difficulty, modes, modelKey, avoidQuestions, focus: focusInput } = (body ?? {}) as Record<string, unknown>;
    // Optional: aims the set at specific concepts. Malformed means unfocused.
    const focus = parseConceptFocus(focusInput);

    if (typeof docUrl !== "string" || !docUrl) return NextResponse.json({ error: "Document URL is required" }, { status: 400 });
    if (!PRACTICE_KINDS.includes(kind as PracticeKind)) return NextResponse.json({ error: "Choose a practice type." }, { status: 400 });
    if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > MAX_PRACTICE_ITEMS) {
      return NextResponse.json({ error: `Choose between 1 and ${MAX_PRACTICE_ITEMS} questions.` }, { status: 400 });
    }
    const level: PracticeDifficulty = DIFFICULTIES.includes(difficulty as PracticeDifficulty) ? (difficulty as PracticeDifficulty) : "exam";
    const chosenModes = Array.isArray(modes) ? modes.filter((m): m is DragDropMode => MODES.includes(m as DragDropMode)) : [];
    if (kind === "drag_drop" && Array.isArray(modes) && chosenModes.length === 0) {
      return NextResponse.json({ error: "Choose at least one kind of drag-and-drop round." }, { status: 400 });
    }
    const avoid = Array.isArray(avoidQuestions)
      ? avoidQuestions.filter((q): q is string => typeof q === "string" && q.trim().length > 0).slice(0, 60).map((q) => q.slice(0, 500))
      : [];

    // The document must belong to the signed-in student before the internal download bypass is used.
    const key = documentKey(docUrl);
    if (!key || !key.startsWith(`users/${auth.uid}/`)) {
      return NextResponse.json({ error: "You do not have permission to use this document." }, { status: 403 });
    }

    const extension = (typeof docName === "string" ? docName : "").split(".").pop()?.toLowerCase() || "pdf";
    let text: string;
    try {
      text = await getDocumentText(request, docUrl, extension);
    } catch (error) {
      console.error("Failed to read practice document:", error);
      return NextResponse.json({ error: `Couldn't read this document (.${extension}).` }, { status: 400 });
    }
    text = text.slice(0, MAX_DOCUMENT_CHARS);
    if (text.trim().length < 200) {
      return NextResponse.json({ error: "Couldn't find enough text in this document to build practice from." }, { status: 400 });
    }

    const slot = acquireSlot("practice-generation", auth.uid, { perKey: MAX_PER_STUDENT, total: MAX_SITE_WIDE });
    if (!slot.ok) {
      return NextResponse.json(
        {
          error:
            slot.reason === "per-user"
              ? "You already have a practice set being generated. Please wait for it to finish."
              : "Lots of practice sets are being built right now. Please try again in a minute.",
        },
        { status: 429, headers: { "Retry-After": "20" } }
      );
    }
    try {
      const baseUrl = await resolveOllamaBaseUrl(process.env.OLLAMA_PRIMARY_URL || "", process.env.OLLAMA_PRIMARY_FALLBACK_URL);
      const result = await generatePractice({
        kind: kind as PracticeKind,
        text,
        count,
        difficulty: level,
        modes: chosenModes.length ? chosenModes : undefined,
        baseUrl,
        modelKey: typeof modelKey === "string" ? modelKey : undefined,
        avoid,
        focus,
      });
      return NextResponse.json({ topicName: result.topicName, items: result.items });
    } catch (error) {
      console.error("Practice generation failed:", error);
      const timedOut =
        (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) ||
        (error instanceof Error && error.message.startsWith("Generation timed out"));
      if (timedOut) {
        return NextResponse.json(
          { error: "The AI took too long to build this practice. Try fewer rounds or questions, or try again in a minute." },
          { status: 504 }
        );
      }
      return NextResponse.json(
        { error: error instanceof Error && error.message.startsWith("Couldn't build") ? error.message : "The assistant returned an unexpected response. Please try again." },
        { status: 502 }
      );
    } finally {
      slot.release();
    }
  } catch (error) {
    console.error("Practice generation error:", error);
    return NextResponse.json({ error: "Failed to generate practice. Please try again." }, { status: 500 });
  }
}

// A server error on our side refunds whatever this request spent (refundOnFailure.ts).
export const POST = refundOnFailure("practice-generation", handlePOST);
