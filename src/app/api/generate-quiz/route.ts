import { NextRequest, NextResponse } from 'next/server';

import { resolveOllamaBaseUrl } from '@/src/library/ollamaClient';
import { verifyRequestAuth } from '@/src/library/verifyAuth';
import { checkRateLimit } from '@/src/library/rateLimit';
import { generateQuizWithValidation, type QuestionTypes } from '@/src/library/quizGeneration';
import { getDocumentText } from '@/src/library/documentTextCache';

// Same GPU/LLM-cost-bearing rationale as api/chat and api/embed-document's
// own rate limits (see rateLimit.ts) — this route makes an identical kind
// of Ollama call and had no limit at all until 2026-08-14's bug sweep.
const QUIZ_RATE_LIMIT_WINDOW_MS = 60_000;
const QUIZ_RATE_LIMIT_MAX = 10; // per user per window — generating a quiz isn't normally rapid-fire

function getDocumentKey(docUrl: string): string | null {
  try {
    const parsedUrl = new URL(docUrl, 'http://internal');
    return parsedUrl.searchParams.get('key');
  } catch {
    return null;
  }
}

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

    const {
      docUrl,
      docName,
      questionCount,
      questionTypes,
      modelKey,
      avoidQuestions,
    } = await request.json();
    // "New questions" on a quiz sends the old ones so they aren't repeated.
    const avoid = Array.isArray(avoidQuestions)
      ? avoidQuestions.filter((q: unknown): q is string => typeof q === 'string' && q.trim().length > 0).slice(0, 60).map((q: string) => q.slice(0, 500))
      : [];

    if (typeof docUrl !== 'string' || !docUrl) {
      return NextResponse.json(
        { error: 'Document URL is required' },
        { status: 400 }
      );
    }

    if (
      typeof questionCount !== 'number' ||
      questionCount < 1 ||
      questionCount > 20
    ) {
      return NextResponse.json(
        {
          error:
            'Question count must be between 1 and 20.',
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
     * Verify that the requested MinIO object belongs to the
     * authenticated user before using the internal secret.
     */
    const documentKey = getDocumentKey(docUrl);

    if (
      !documentKey ||
      !documentKey.startsWith(`users/${auth.uid}/`)
    ) {
      return NextResponse.json(
        {
          error:
            'You do not have permission to use this document.',
        },
        { status: 403 }
      );
    }

    // The document's text - extracted once and cached (documentTextCache.ts),
    // with the same extractor as the chat, so Word, Excel, code and scanned
    // files work here too (this route used to accept only PDF and text).
    const fileName = typeof docName === 'string' ? docName : '';
    const extension = fileName.split('.').pop()?.toLowerCase() || 'pdf';
    let extractedText = '';
    try {
      extractedText = await getDocumentText(request, docUrl, extension);
    } catch (error) {
      console.error('Failed to read quiz document:', error);
      return NextResponse.json({ error: `Couldn't read this document (.${extension}).` }, { status: 400 });
    }

    const maxChars = 50_000;

    if (extractedText.length > maxChars) {
      extractedText = extractedText.substring(
        0,
        maxChars
      );
    }

    if (extractedText.trim().length < 50) {
      return NextResponse.json(
        {
          error:
            'Could not extract enough text from this document to generate a quiz.',
        },
        { status: 400 }
      );
    }

    const baseUrl = await resolveOllamaBaseUrl(
      process.env.OLLAMA_PRIMARY_URL || '',
      process.env.OLLAMA_PRIMARY_FALLBACK_URL
    );

    let result;
    try {
      result = await generateQuizWithValidation(extractedText, questionCount, types, baseUrl, modelKey, avoid);
    } catch (error) {
      console.error('Quiz generation failed:', error);
      return NextResponse.json(
        { error: 'The assistant returned an unexpected response. Please try again.' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      topicName: result.topicName,
      questions: result.questions,
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