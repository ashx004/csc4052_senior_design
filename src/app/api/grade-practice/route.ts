import { NextRequest, NextResponse } from "next/server";
import { firestoreGet, getIdToken } from "@/src/library/firestoreRest";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { enterAiUser } from "@/src/library/ai/usageScope";
import { aiCreditGate } from "@/src/library/billing/creditGate";
import { checkRateLimit } from "@/src/library/rateLimit";
import { resolveOllamaBaseUrl } from "@/src/library/ollamaClient";
import { gradeWrittenAnswer } from "@/src/library/practice/writtenAnswer";
import { MAX_WRITTEN_ANSWER_CHARS, type WordProblemItem } from "@/src/library/practice/types";
import { refundOnFailure } from "@/src/library/billing/refundOnFailure";

// Grades one written word-problem answer. The question and its model answer are
// read from the student's own saved practice set here on the server, never taken
// from the request, so this can only be used to grade answers to their questions
// (not as a general-purpose AI endpoint), and the rubric can't be swapped.

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const ID = /^[A-Za-z0-9_-]{1,128}$/;

async function handlePOST(request: NextRequest) {
  try {
    const auth = await verifyRequestAuth(request);
    const idToken = getIdToken(request);
    if (!auth || !idToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    enterAiUser(auth.uid);
    const outOfCredit = await aiCreditGate(auth.uid);
    if (outOfCredit) return outOfCredit;

    const limit = checkRateLimit(`practice-grade:${auth.uid}`, RATE_WINDOW_MS, RATE_MAX);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many answers being checked at once - please wait a moment." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }

    const { courseId, setId, itemId, answer, modelKey, custom } = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    // A custom set (made from the student's own prompt and files) has no class.
    const isCustom = custom === true && courseId === undefined;
    if (![...(isCustom ? [] : [courseId]), setId, itemId].every((v) => typeof v === "string" && ID.test(v)) || typeof answer !== "string") {
      return NextResponse.json({ error: "courseId (or custom), setId, itemId and answer are required" }, { status: 400 });
    }
    if (answer.length > MAX_WRITTEN_ANSWER_CHARS) {
      return NextResponse.json({ error: `Keep your answer under ${MAX_WRITTEN_ANSWER_CHARS} characters.` }, { status: 400 });
    }

    const set = await firestoreGet(
      idToken,
      isCustom ? `users/${auth.uid}/customSets` : `users/${auth.uid}/enrollment/${courseId}/practiceSets`,
      setId as string
    );
    const items = Array.isArray(set?.items) ? (set.items as Record<string, unknown>[]) : [];
    const item = items.find((i) => i.id === itemId);
    if (!item || item.kind !== "word_problem" || item.answerType !== "text") {
      return NextResponse.json({ error: "That question can't be graded here." }, { status: 404 });
    }
    const problem = item as unknown as WordProblemItem;

    const baseUrl = await resolveOllamaBaseUrl(process.env.OLLAMA_PRIMARY_URL || "", process.env.OLLAMA_PRIMARY_FALLBACK_URL);
    const grade = await gradeWrittenAnswer({
      baseUrl,
      modelKey: typeof modelKey === "string" ? modelKey : undefined,
      item: { problem: String(problem.problem), expectedAnswer: String(problem.expectedAnswer), keyPoints: Array.isArray(problem.keyPoints) ? problem.keyPoints.map(String) : [] },
      answer,
    });
    if (!grade) return NextResponse.json({ error: "Couldn't check that answer right now. Please try again." }, { status: 502 });
    return NextResponse.json(grade);
  } catch (error) {
    console.error("Practice grading error:", error);
    return NextResponse.json({ error: "Couldn't check that answer right now. Please try again." }, { status: 500 });
  }
}

// A server error on our side refunds whatever this request spent (refundOnFailure.ts).
export const POST = refundOnFailure("practice-grading", handlePOST);
