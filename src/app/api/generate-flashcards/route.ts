import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth } from '@/src/library/verifyAuth';
import { enterAiUser } from "@/src/library/ai/usageScope";
import { aiCreditGate } from "@/src/library/billing/creditGate";
import { resolveOllamaBaseUrl } from '@/src/library/ollamaClient';
import { checkRateLimit } from '@/src/library/rateLimit';
import { generateFlashcardsWithRetry, MAX_FLASHCARDS } from '@/src/library/flashcardGeneration';
import { generateAcrossSources } from '@/src/library/generation/orchestrator';
import { countFromBody, sourcesFromBody } from '@/src/library/sources/requestSources';
import { isSourceSelectionError } from '@/src/library/sources/errors';
import { courseIdFromBody, resolveDepsFor } from '@/src/library/sources/resolveDeps';
import { resolveSources } from '@/src/library/sources/resolveSources';

// Same GPU/LLM-cost-bearing rationale as api/chat and api/embed-document's
// own rate limits (see rateLimit.ts) — this route makes an identical kind
// of Ollama call and had no limit at all until 2026-08-14's bug sweep.
const FLASHCARD_RATE_LIMIT_WINDOW_MS = 60_000;
const FLASHCARD_RATE_LIMIT_MAX = 10; // per user per window

/** Cards for a request that names no count. */
const DEFAULT_FLASHCARD_COUNT = 20;

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    enterAiUser(auth.uid);
    const outOfCredit = await aiCreditGate(auth.uid);
    if (outOfCredit) return outOfCredit;

    const rateLimit = checkRateLimit(auth.uid, FLASHCARD_RATE_LIMIT_WINDOW_MS, FLASHCARD_RATE_LIMIT_MAX);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many flashcard sets being generated at once — please wait a moment.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      );
    }

    const requestBody = await request.json();
    const sourceInput = sourcesFromBody(requestBody);
    const { previousQuestions, modelKey } = requestBody as { previousQuestions?: string[]; modelKey?: string };
    // Optional: a legacy docUrl-only request carries no courseId, so
    // indexStatusOf reports "not indexed" and every source takes the
    // raw-text path — exactly today's behavior.
    const courseId = courseIdFromBody(requestBody);

    if (sourceInput.length === 0) {
      return NextResponse.json({ error: 'Pick at least one document or note.' }, { status: 400 });
    }

    let count: number;
    try {
      count = countFromBody(requestBody, MAX_FLASHCARDS, DEFAULT_FLASHCARD_COUNT);
    } catch (error) {
      if (!isSourceSelectionError(error)) throw error;
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!process.env.OLLAMA_PRIMARY_URL || !process.env.OLLAMA_AUTH_TOKEN) {
      return NextResponse.json({ error: 'The AI assistant is not configured.' }, { status: 500 });
    }

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
        { error: "Couldn't read any of the documents you picked.", skipped: resolved.skipped },
        { status: 400 }
      );
    }

    const baseUrl = await resolveOllamaBaseUrl(process.env.OLLAMA_PRIMARY_URL, process.env.OLLAMA_PRIMARY_FALLBACK_URL);

    let generated;
    try {
      generated = await generateAcrossSources({
        sources: resolved.sources,
        count,
        // Flashcards are always one shuffled pool across every source.
        shuffle: true,
        generate: async (source, quota, alreadyAsked) => {
          const result = await generateFlashcardsWithRetry(
            source.text,
            baseUrl,
            modelKey,
            [...(previousQuestions ?? []), ...alreadyAsked],
            quota
          );
          return { topicName: result.topicName, items: result.questions };
        },
      });
    } catch (error) {
      // allocateQuotas rejects a count too small for the sources picked, and
      // says how to fix it — that belongs in front of the student, not in a
      // generic 500.
      console.error('Flashcard generation failed:', error);
      if (!isSourceSelectionError(error)) throw error;
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // The orchestrator absorbs a per-source model failure so one bad lecture
    // cannot lose the whole set; nothing at all surviving still means the
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
      audit: generated.audit,
      skipped: resolved.skipped,
      sourceKeys: resolved.sources.map((s) => s.sourceKey).filter((k): k is string => !!k),
    });
  } catch (error) {
    console.error('Flashcard generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate flashcards. Please try again.' },
      { status: 500 }
    );
  }
}
