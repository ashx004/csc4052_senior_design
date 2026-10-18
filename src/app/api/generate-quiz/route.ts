import { NextRequest, NextResponse } from 'next/server';

import { resolveOllamaBaseUrl } from '@/src/library/ollamaClient';
import { verifyRequestAuth } from '@/src/library/verifyAuth';
import { checkRateLimit } from '@/src/library/rateLimit';
import {
  generateQuizWithValidation,
  MAX_QUIZ_QUESTIONS,
  type QuestionTypes,
} from '@/src/library/quizGeneration';
import { parseQuizDifficulty } from '@/src/library/quizDifficulty';
import { generateAcrossSources } from '@/src/library/generation/orchestrator';
import { sourcesFromBody } from '@/src/library/sources/requestSources';
import { isSourceSelectionError } from '@/src/library/sources/errors';
import { courseIdFromBody, resolveDepsFor } from '@/src/library/sources/resolveDeps';
import { resolveSources } from '@/src/library/sources/resolveSources';

// Same GPU/LLM-cost-bearing rationale as api/chat and api/embed-document's
// own rate limits (see rateLimit.ts) — this route makes an identical kind
// of Ollama call and had no limit at all until 2026-08-14's bug sweep.
const QUIZ_RATE_LIMIT_WINDOW_MS = 60_000;
const QUIZ_RATE_LIMIT_MAX = 10; // per user per window — generating a quiz isn't normally rapid-fire

export async function POST(request: NextRequest) {
  try {
    /*
     * Authenticate this API route before allowing it to use the
     * internal download bypass.
     */
    const auth = await verifyRequestAuth(request);

    if (!auth) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const rateLimit = checkRateLimit(auth.uid, QUIZ_RATE_LIMIT_WINDOW_MS, QUIZ_RATE_LIMIT_MAX);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many quizzes being generated at once — please wait a moment.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      );
    }

    const requestBody = await request.json();
    const {
      questionCount,
      questionTypes,
      modelKey,
      avoidQuestions,
      difficulty,
    } = requestBody as {
      questionCount?: unknown;
      questionTypes?: QuestionTypes;
      modelKey?: string;
      avoidQuestions?: unknown;
      difficulty?: unknown;
    };
    // "New questions" on a quiz sends the old ones so they aren't repeated.
    const avoid = Array.isArray(avoidQuestions)
      ? avoidQuestions.filter((q: unknown): q is string => typeof q === 'string' && q.trim().length > 0).slice(0, 60).map((q: string) => q.slice(0, 500))
      : [];
    // Unknown or missing level → Exam-style (older callers send none).
    const level = parseQuizDifficulty(difficulty);
    // Optional: a legacy docUrl-only request carries no courseId, so
    // indexStatusOf reports "not indexed" and every source takes the
    // raw-text path — exactly today's behavior.
    const courseId = courseIdFromBody(requestBody);

    const sourceInput = sourcesFromBody(requestBody);
    if (sourceInput.length === 0) {
      return NextResponse.json(
        { error: 'Document URL is required' },
        { status: 400 }
      );
    }

    if (
      typeof questionCount !== 'number' ||
      !Number.isInteger(questionCount) ||
      questionCount < 1 ||
      questionCount > MAX_QUIZ_QUESTIONS
    ) {
      return NextResponse.json(
        {
          error: `Question count must be between 1 and ${MAX_QUIZ_QUESTIONS}.`,
        },
        { status: 400 }
      );
    }

    const types: QuestionTypes = questionTypes || {};

    if (!types.multipleChoice && !types.trueFalse && !types.matching) {
      return NextResponse.json(
        {
          error: 'Select at least one question type.',
        },
        { status: 400 }
      );
    }

    /*
     * Ownership of each requested object storage object is verified inside
     * resolveSources (ownsUrl), which skips anything that is not the
     * caller's own file rather than failing the whole request.
     */
    let resolved;
    try {
      resolved = await resolveSources(resolveDepsFor(request, auth.uid, courseId), sourceInput);
    } catch (error) {
      // Only a message written for the student becomes a 400; a object storage or
      // Qdrant failure is not the caller's fault and keeps the generic 500.
      if (!isSourceSelectionError(error)) throw error;
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (resolved.sources.length === 0) {
      return NextResponse.json(
        {
          error: "Couldn't read any of the documents you picked.",
          skipped: resolved.skipped,
        },
        { status: 400 }
      );
    }

    const baseUrl = await resolveOllamaBaseUrl(
      process.env.OLLAMA_PRIMARY_URL || '',
      process.env.OLLAMA_PRIMARY_FALLBACK_URL
    );

    let generated;
    try {
      generated = await generateAcrossSources({
        sources: resolved.sources,
        count: questionCount,
        // Source order is kept on purpose: how a multi-source quiz is
        // ordered (interleaved for review, blocked for a first pass) is the
        // caller's decision, not the engine's.
        shuffle: false,
        generate: async (source, quota, alreadyAsked) => {
          const result = await generateQuizWithValidation(
            source.text,
            quota,
            types,
            baseUrl,
            modelKey,
            [...avoid, ...alreadyAsked],
            level
          );
          return { topicName: result.topicName, items: result.questions };
        },
      });
    } catch (error) {
      // allocateQuotas rejects a count too small for the sources picked, and
      // says how to fix it — that belongs in front of the student, not in a
      // generic 500.
      console.error('Quiz generation failed:', error);
      if (!isSourceSelectionError(error)) throw error;
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // The orchestrator absorbs a per-source model failure so one bad lecture
    // cannot lose the whole quiz; nothing at all surviving still means the
    // assistant failed, which is the 502 this route has always returned.
    if (generated.items.length === 0) {
      return NextResponse.json(
        { error: 'The assistant returned an unexpected response. Please try again.', skipped: resolved.skipped },
        { status: 502 }
      );
    }

    return NextResponse.json({
      topicName: generated.topicName,
      questions: generated.items,
      difficulty: level,
      audit: generated.audit,
      skipped: resolved.skipped,
      sourceKeys: resolved.sources.map((s) => s.sourceKey).filter((k): k is string => !!k),
    });
  } catch (error) {
    console.error('Quiz generation error:', error);

    return NextResponse.json(
      {
        error:
          'Failed to generate quiz. Please try again.',
      },
      { status: 500 }
    );
  }
}
