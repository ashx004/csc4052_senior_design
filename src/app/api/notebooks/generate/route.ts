import { NextRequest, NextResponse } from "next/server";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { checkRateLimit } from "@/src/library/rateLimit";
import { resolveOllamaBaseUrl } from "@/src/library/ollamaClient";
import { generateFlashcardsWithRetry } from "@/src/library/flashcardGeneration";
import { generateQuizWithValidation, MAX_QUIZ_QUESTIONS, type QuestionTypes } from "@/src/library/quizGeneration";
import { parseQuizDifficulty } from "@/src/library/quizDifficulty";
import { generateAcrossSources } from "@/src/library/generation/orchestrator";
import { sourcesFromBody } from "@/src/library/sources/requestSources";
import { isSourceSelectionError } from "@/src/library/sources/errors";
import { courseIdFromBody, resolveDepsFor } from "@/src/library/sources/resolveDeps";
import { MAX_SOURCES, resolveSources } from "@/src/library/sources/resolveSources";
import type { SkippedSource } from "@/src/library/sources/sourceTypes";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 6;

/** Cards for a notebook flashcard set; the modal offers no count for flashcards. */
const DEFAULT_FLASHCARD_COUNT = 20;

/**
 * Flashcards or a quiz from a notebook - a collection of notes that can span
 * classes. The client sends each note as either its text (typed notes) or
 * its file (documents); both shapes go through the shared source layer, which
 * reads files with the same extractors the rest of the app uses, prefers the
 * vector index when a note's resource has one, and budgets each note's text
 * separately instead of concatenating everything into one prompt.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequestAuth(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rate = checkRateLimit(auth.uid, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many study sets being generated at once - please wait a moment." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
      );
    }

    const body = await request.json();
    const kind = body.kind === "quiz" ? "quiz" : body.kind === "flashcards" ? "flashcards" : null;
    const allNotes = sourcesFromBody(body);
    if (!kind) return NextResponse.json({ error: "Choose flashcards or a quiz." }, { status: 400 });
    if (allNotes.length === 0) return NextResponse.json({ error: "This notebook has no notes yet." }, { status: 400 });

    // A notebook may hold up to MAX_NOTES_PER_NOTEBOOK notes, far more than
    // one study set can draw from, and the student picked a notebook rather
    // than this many documents one by one. So the extras are reported, not
    // refused - unlike the flashcard and quiz routes, where every source was
    // ticked by hand and "you picked too many" is the right answer.
    const sourceInput = allNotes.slice(0, MAX_SOURCES);
    const overflow: SkippedSource[] = allNotes
      .slice(MAX_SOURCES)
      .map((note) => ({ title: note.title, reason: "over-source-limit" }));

    const level = parseQuizDifficulty(body.difficulty);
    let count = DEFAULT_FLASHCARD_COUNT;
    let types: QuestionTypes = { multipleChoice: true };
    if (kind === "quiz") {
      count = Number(body.questionCount);
      if (!Number.isInteger(count) || count < 1 || count > MAX_QUIZ_QUESTIONS) {
        return NextResponse.json(
          { error: `Question count must be between 1 and ${MAX_QUIZ_QUESTIONS}.` },
          { status: 400 }
        );
      }
      types = body.questionTypes ?? {};
      if (!types.multipleChoice && !types.trueFalse && !types.matching) {
        return NextResponse.json({ error: "Choose at least one question type." }, { status: 400 });
      }
    }

    if (!process.env.OLLAMA_PRIMARY_URL || !process.env.OLLAMA_AUTH_TOKEN) {
      return NextResponse.json({ error: "The AI assistant is not configured." }, { status: 500 });
    }

    // Ownership of each note's file is checked inside resolveSources
    // (ownsUrl), which skips a file that is not the caller's own rather than
    // failing the whole notebook - the same leniency this route had before.
    let resolved;
    try {
      resolved = await resolveSources(resolveDepsFor(request, auth.uid, courseIdFromBody(body)), sourceInput);
    } catch (error) {
      // Only a message written for the student becomes a 400; a MinIO or
      // Qdrant failure is not the caller's fault and keeps the generic 500.
      if (!isSourceSelectionError(error)) throw error;
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (resolved.sources.length === 0) {
      return NextResponse.json(
        { error: "There isn't enough text in this notebook to generate from yet.", skipped: [...resolved.skipped, ...overflow] },
        { status: 400 }
      );
    }

    // allocateQuotas refuses a count below one item per source, and tells the
    // caller to raise the count or pick fewer sources. A notebook has no
    // source picker - the modal says "uses all N notes" and offers only a
    // count - so that advice is unfollowable here, and a 6-note notebook at
    // 5 questions would 400 on a combination that worked before this branch.
    // This route already truncates on the student's behalf, so it absorbs the
    // floor too: the count rises to at least one item per resolved note.
    // The hand-picked flashcard and quiz routes keep the error, because there
    // the student really can deselect a source.
    count = Math.max(count, resolved.sources.length);

    const baseUrl = await resolveOllamaBaseUrl(process.env.OLLAMA_PRIMARY_URL, process.env.OLLAMA_PRIMARY_FALLBACK_URL);

    let generated;
    try {
      generated =
        kind === "flashcards"
          ? await generateAcrossSources({
              sources: resolved.sources,
              count,
              // Flashcards are one shuffled pool across every note.
              shuffle: true,
              generate: async (source, quota, alreadyAsked) => {
                const result = await generateFlashcardsWithRetry(
                  source.text,
                  baseUrl,
                  body.modelKey,
                  alreadyAsked,
                  quota
                );
                return { topicName: result.topicName, items: result.questions };
              },
            })
          : await generateAcrossSources({
              sources: resolved.sources,
              count,
              // A quiz keeps note order; how it reads is the caller's call.
              shuffle: false,
              generate: async (source, quota, alreadyAsked) => {
                const result = await generateQuizWithValidation(
                  source.text,
                  quota,
                  types,
                  baseUrl,
                  body.modelKey,
                  alreadyAsked,
                  level
                );
                return { topicName: result.topicName, items: result.questions };
              },
            });
    } catch (error) {
      // allocateQuotas rejects a count too small for the notes picked, and
      // says how to fix it - that belongs in front of the student.
      console.error("Notebook generation failed:", error);
      if (!isSourceSelectionError(error)) throw error;
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // The orchestrator absorbs a per-note model failure so one bad note
    // cannot lose the whole set; nothing at all surviving still means the
    // assistant failed, which is the 502 this route has always returned.
    if (generated.items.length === 0) {
      return NextResponse.json(
        { error: "The assistant returned an unexpected response. Please try again.", skipped: [...resolved.skipped, ...overflow] },
        { status: 502 }
      );
    }

    return NextResponse.json({
      topicName: generated.topicName,
      questions: generated.items,
      audit: generated.audit,
      difficulty: level,
      skipped: [...resolved.skipped, ...overflow],
      sourceKeys: resolved.sources.map((s) => s.sourceKey).filter((k): k is string => !!k),
    });
  } catch (error) {
    console.error("Notebook generation error:", error);
    return NextResponse.json({ error: "Failed to generate. Please try again." }, { status: 500 });
  }
}
