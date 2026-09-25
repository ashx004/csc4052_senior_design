import { NextRequest, NextResponse } from "next/server";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { checkRateLimit } from "@/src/library/rateLimit";
import { resolveInternalUrl } from "@/src/library/pdfExtract";
import { extractDocumentText } from "@/src/library/documentExtract";
import { resolveOllamaBaseUrl } from "@/src/library/ollamaClient";
import { generateFlashcardsWithRetry } from "@/src/library/flashcardGeneration";
import { generateQuizWithValidation, type QuestionTypes } from "@/src/library/quizGeneration";
import { assembleNotebookText, NOTEBOOK_TEXT_LIMIT } from "@/src/library/notes/notebookText";
import { MAX_NOTES_PER_NOTEBOOK } from "@/src/library/notes/types";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 6;

type Source = { title?: unknown; text?: unknown; url?: unknown; fileType?: unknown };

/**
 * Flashcards or a quiz from a notebook - a collection of notes that can span
 * classes. The client sends each note as either its text (typed notes) or
 * its file (documents); files are read here with the same extractors the
 * rest of the app uses, then everything goes to the existing generators.
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
    const sources: Source[] = Array.isArray(body.sources) ? body.sources.slice(0, MAX_NOTES_PER_NOTEBOOK) : [];
    if (!kind) return NextResponse.json({ error: "Choose flashcards or a quiz." }, { status: 400 });
    if (sources.length === 0) return NextResponse.json({ error: "This notebook has no notes yet." }, { status: 400 });

    let questionCount = 10;
    let types: QuestionTypes = { multipleChoice: true };
    if (kind === "quiz") {
      questionCount = Number(body.questionCount);
      if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 20) {
        return NextResponse.json({ error: "Question count must be between 1 and 20." }, { status: 400 });
      }
      types = body.questionTypes ?? {};
      if (!types.multipleChoice && !types.trueFalse && !types.matching) {
        return NextResponse.json({ error: "Choose at least one question type." }, { status: 400 });
      }
    }

    if (!process.env.OLLAMA_PRIMARY_URL || !process.env.OLLAMA_AUTH_TOKEN) {
      return NextResponse.json({ error: "The AI assistant is not configured." }, { status: 500 });
    }

    const ownPrefixes = [`/api/download?key=users%2F${auth.uid}%2F`, `/api/download?key=users/${auth.uid}/`];
    const parts: { title: string; text: string }[] = [];
    let total = 0;
    const skipped: string[] = [];
    for (const source of sources) {
      if (total >= NOTEBOOK_TEXT_LIMIT) break;
      const title = typeof source.title === "string" ? source.title.slice(0, 200) : "Untitled note";
      if (typeof source.text === "string") {
        parts.push({ title, text: source.text });
        total += source.text.length;
        continue;
      }
      const url = typeof source.url === "string" ? source.url : "";
      const fileType = typeof source.fileType === "string" ? source.fileType.toLowerCase() : "";
      // Only the caller's own files - same check the single-document routes use.
      if (!url || !ownPrefixes.some((p) => url.startsWith(p))) {
        skipped.push(title);
        continue;
      }
      try {
        const text = await extractDocumentText(resolveInternalUrl(request, url), fileType);
        parts.push({ title, text });
        total += text.length;
      } catch (e) {
        console.warn(`Notebook generation: couldn't read "${title}":`, e);
        skipped.push(title);
      }
    }

    const text = assembleNotebookText(parts);
    if (text.trim().length < 50) {
      return NextResponse.json({ error: "There isn't enough text in this notebook to generate from yet." }, { status: 400 });
    }

    const baseUrl = await resolveOllamaBaseUrl(process.env.OLLAMA_PRIMARY_URL, process.env.OLLAMA_PRIMARY_FALLBACK_URL);
    try {
      if (kind === "flashcards") {
        const result = await generateFlashcardsWithRetry(text, baseUrl, body.modelKey);
        return NextResponse.json({ topicName: result.topicName, questions: result.questions, skipped });
      }
      const result = await generateQuizWithValidation(text, questionCount, types, baseUrl, body.modelKey);
      return NextResponse.json({ topicName: result.topicName, questions: result.questions, skipped });
    } catch (e) {
      console.error("Notebook generation failed:", e);
      return NextResponse.json({ error: "The assistant returned an unexpected response. Please try again." }, { status: 502 });
    }
  } catch (error) {
    console.error("Notebook generation error:", error);
    return NextResponse.json({ error: "Failed to generate. Please try again." }, { status: 500 });
  }
}
