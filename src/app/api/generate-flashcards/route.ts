import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth } from '@/src/library/verifyAuth';
import { resolveOllamaBaseUrl } from '@/src/library/ollamaClient';
import { checkRateLimit } from '@/src/library/rateLimit';
import { generateFlashcardsWithRetry } from '@/src/library/flashcardGeneration';
import { getDocumentText } from '@/src/library/documentTextCache';

// Same GPU/LLM-cost-bearing rationale as api/chat and api/embed-document's
// own rate limits (see rateLimit.ts) — this route makes an identical kind
// of Ollama call and had no limit at all until 2026-08-14's bug sweep.
const FLASHCARD_RATE_LIMIT_WINDOW_MS = 60_000;
const FLASHCARD_RATE_LIMIT_MAX = 10; // per user per window

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rateLimit = checkRateLimit(auth.uid, FLASHCARD_RATE_LIMIT_WINDOW_MS, FLASHCARD_RATE_LIMIT_MAX);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many flashcard sets being generated at once — please wait a moment.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      );
    }

    const { docUrl, docName, previousQuestions, modelKey } = await request.json();

    if (!docUrl) {
      return NextResponse.json({ error: 'Document URL is required' }, { status: 400 });
    }
    if (!docUrl.startsWith(`/api/download?key=users%2F${auth.uid}%2F`) && !docUrl.startsWith(`/api/download?key=users/${auth.uid}/`)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!process.env.OLLAMA_PRIMARY_URL || !process.env.OLLAMA_AUTH_TOKEN) {
      return NextResponse.json({ error: 'The AI assistant is not configured.' }, { status: 500 });
    }

    // 1. The document's text - extracted once and cached (documentTextCache.ts).
    // Uses the same extractor as the chat, so Word, Excel, code and scanned
    // files work here too (this route used to accept only PDF and text).
    const extension = (docName || '').split('.').pop()?.toLowerCase() || 'pdf';
    let extractedText = '';
    try {
      extractedText = await getDocumentText(request, docUrl, extension);
    } catch (error) {
      console.error('Failed to read flashcard document:', error);
      return NextResponse.json({ error: `Couldn't read this document (.${extension}).` }, { status: 400 });
    }

    // Truncate if too long
    const maxChars = 50000;
    if (extractedText.length > maxChars) {
      extractedText = extractedText.substring(0, maxChars);
    }

    if (extractedText.trim().length < 50) {
      return NextResponse.json(
        { error: 'Could not extract enough text from this document to generate flashcards.' },
        { status: 400 }
      );
    }

    // 3. Call Ollama with structured output, retrying once on bad JSON
    const baseUrl = await resolveOllamaBaseUrl(process.env.OLLAMA_PRIMARY_URL, process.env.OLLAMA_PRIMARY_FALLBACK_URL);

    let parsed;
    try {
      parsed = await generateFlashcardsWithRetry(extractedText, baseUrl, modelKey, previousQuestions);
    } catch (error) {
      console.error('Flashcard generation failed after retry:', error);
      return NextResponse.json(
        { error: 'The assistant returned an unexpected response. Please try again.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ topicName: parsed.topicName, questions: parsed.questions });
  } catch (error) {
    console.error('Flashcard generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate flashcards. Please try again.' },
      { status: 500 }
    );
  }
}
