import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth } from '@/src/library/verifyAuth';
import {
  fetchInternal,
  resolveInternalUrl,
} from '@/src/library/pdfExtract';
import { resolveOllamaBaseUrl } from '@/src/library/ollamaClient';
import { checkRateLimit } from '@/src/library/rateLimit';
import { generateFlashcardsWithRetry } from '@/src/library/flashcardGeneration';

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

    // 1. Fetch the document through the protected internal download route
    const fullUrl = resolveInternalUrl(request, docUrl);
    const fileResponse = await fetchInternal(fullUrl);

    if (!fileResponse.ok) {
      console.error(
        `Failed to download flashcard document: ${fileResponse.status} ${fileResponse.statusText}`
      );

      return NextResponse.json(
        { error: `Failed to download document (${fileResponse.status})` },
        { status: 500 }
      );
    }

    // 2. Extract text from the document
    const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());

    let extractedText = '';
    const fileName = docName || '';
    const extension = fileName.split('.').pop()?.toLowerCase();

    if (extension === 'pdf') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse/lib/pdf-parse.js');
      const pdfData = await pdfParse(fileBuffer);
      extractedText = pdfData.text;

      extractedText = pdfData.text;
    } else if (['txt', 'md', 'csv'].includes(extension || '')) {
      extractedText = fileBuffer.toString('utf-8');
    } else {
      return NextResponse.json(
        { error: `File type .${extension} is not supported yet. Please use PDF or text files.` },
        { status: 400 }
      );
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
