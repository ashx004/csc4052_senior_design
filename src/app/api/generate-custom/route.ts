import { NextRequest, NextResponse } from "next/server";
import { resolveOllamaBaseUrl } from "@/src/library/ollamaClient";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { checkRateLimit } from "@/src/library/rateLimit";
import { acquireSlot } from "@/src/library/concurrencyLimit";
import { firestoreCreate, getIdToken } from "@/src/library/firestoreRest";
import { generateQuizWithValidation } from "@/src/library/quizGeneration";
import { generateFlashcardsWithRetry } from "@/src/library/flashcardGeneration";
import { generatePractice } from "@/src/library/practice/generation";
import { generateAcrossSources } from "@/src/library/generation/orchestrator";
import { isSourceSelectionError } from "@/src/library/sources/errors";
import { resolveDepsFor } from "@/src/library/sources/resolveDeps";
import { resolveSources } from "@/src/library/sources/resolveSources";
import { customSources, parseCustomRequest, withInstructions, type CustomRequest } from "@/src/library/custom/customRequest";

// One-off study material from the student's own prompt and uploaded files, with
// no class attached: a quiz, flashcards or a practice set. The files were
// uploaded under users/{uid}/custom/ (checked in parseCustomRequest), are read
// by the same source layer as every other generator, and the result is saved
// at users/{uid}/customSets/{id} - the student's own area, which account
// export and deletion already cover.

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 6;
const MAX_PRACTICE_CHARS = 50_000;
const PRACTICE_SLOT = { perKey: 1, total: Number(process.env.PRACTICE_MAX_CONCURRENT) > 0 ? Number(process.env.PRACTICE_MAX_CONCURRENT) : 3 };

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequestAuth(request);
    const idToken = getIdToken(request);
    if (!auth || !idToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const limit = checkRateLimit(`custom-generate:${auth.uid}`, RATE_WINDOW_MS, RATE_MAX);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many sets being generated at once - please wait a moment." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }

    const parsed = parseCustomRequest(await request.json().catch(() => null), auth.uid);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const req = parsed.request;

    if (!process.env.OLLAMA_PRIMARY_URL || !process.env.OLLAMA_AUTH_TOKEN) {
      return NextResponse.json({ error: "The AI assistant is not configured." }, { status: 500 });
    }

    // No class, so no per-resource index to consult: files are read directly.
    let resolved;
    try {
      resolved = await resolveSources(resolveDepsFor(request, auth.uid, undefined), customSources(req));
    } catch (error) {
      if (!isSourceSelectionError(error)) throw error;
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (resolved.sources.length === 0) {
      return NextResponse.json(
        { error: "Couldn't read any text from what you added.", skipped: resolved.skipped },
        { status: 400 }
      );
    }

    const baseUrl = await resolveOllamaBaseUrl(process.env.OLLAMA_PRIMARY_URL, process.env.OLLAMA_PRIMARY_FALLBACK_URL);
    const sourceNames = resolved.sources.map((source) => source.title);

    let setData: Record<string, unknown>;
    if (req.type === "practice") {
      const slot = acquireSlot("practice-generation", auth.uid, PRACTICE_SLOT);
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
        // Practice reads one body of text, so the sources are joined, each
        // headed by its name, within the same cap a single document gets.
        const joined = resolved.sources.map((source) => `## ${source.title}\n\n${source.text}`).join("\n\n").slice(0, MAX_PRACTICE_CHARS);
        const result = await generatePractice({
          kind: req.practiceKind,
          text: withInstructions(joined, req.prompt),
          count: req.count,
          difficulty: req.difficulty,
          baseUrl,
          modelKey: req.modelKey,
        });
        setData = { name: result.topicName, kind: req.practiceKind, items: result.items };
      } catch (error) {
        console.error("Custom practice generation failed:", error);
        return NextResponse.json(
          { error: error instanceof Error && error.message.startsWith("Couldn't build") ? error.message : "The assistant returned an unexpected response. Please try again." },
          { status: 502 }
        );
      } finally {
        slot.release();
      }
    } else {
      // allocateQuotas needs one item per source; asking for 3 across 5 files
      // can't be fixed by the student picking fewer, so the count rises.
      const count = Math.max(req.count, resolved.sources.length);
      // The prompt is also a source when it was long; it needn't instruct itself.
      const instruct = (title: string, text: string) => (title === "Your prompt" ? text : withInstructions(text, req.prompt));
      try {
        const generated =
          req.type === "quiz"
            ? await generateAcrossSources({
                sources: resolved.sources,
                count,
                shuffle: false,
                generate: async (source, quota, alreadyAsked) => {
                  const result = await generateQuizWithValidation(instruct(source.title, source.text), quota, req.questionTypes, baseUrl, req.modelKey, alreadyAsked, req.difficulty);
                  return { topicName: result.topicName, items: result.questions };
                },
              })
            : await generateAcrossSources({
                sources: resolved.sources,
                count,
                shuffle: true,
                generate: async (source, quota, alreadyAsked) => {
                  const result = await generateFlashcardsWithRetry(instruct(source.title, source.text), baseUrl, req.modelKey, alreadyAsked, quota);
                  return { topicName: result.topicName, items: result.questions };
                },
              });
        if (generated.items.length === 0) {
          return NextResponse.json({ error: "The assistant returned an unexpected response. Please try again.", skipped: resolved.skipped }, { status: 502 });
        }
        setData =
          req.type === "quiz"
            ? { name: generated.topicName, questions: generated.items, questionTypes: req.questionTypes, questionCount: generated.items.length }
            : { name: generated.topicName, cards: generated.items };
      } catch (error) {
        console.error("Custom generation failed:", error);
        if (!isSourceSelectionError(error)) throw error;
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    const name = String(setData.name || "Custom set").slice(0, 120);
    const now = new Date();
    const setId = await firestoreCreate(idToken, `users/${auth.uid}/customSets`, {
      ...setData,
      name,
      type: req.type,
      difficulty: req.difficulty,
      // Kept so the set can say what it was made from and be made again.
      prompt: req.prompt,
      sourceNames,
      createdAt: now,
      updatedAt: now,
    });
    if (!setId) {
      return NextResponse.json({ error: "The set was generated but couldn't be saved. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ setId, name, type: req.type, skipped: resolved.skipped });
  } catch (error) {
    console.error("Custom generation error:", error);
    return NextResponse.json({ error: "Failed to generate. Please try again." }, { status: 500 });
  }
}

export type { CustomRequest };
