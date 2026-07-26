import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyRequestAuth } from '@/src/library/verifyAuth';

const FlashcardResponseSchema = z.object({
  topicName: z
    .string()
    .describe('A short, descriptive name (3-6 words) summarizing what this set of flashcards covers'),
  questions: z.array(
    z.object({
      question: z.string().describe('A clear, concise question about a key concept from the document'),
      answer: z.string().describe('A brief, accurate answer in 1-2 sentences'),
    })
  ),
});

const FLASHCARD_JSON_SCHEMA = {
  type: 'object',
  properties: {
    topicName: { type: 'string' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          answer: { type: 'string' },
        },
        required: ['question', 'answer'],
      },
    },
  },
  required: ['topicName', 'questions'],
};

const OLLAMA_TIMEOUT_MS = 120000; // same as chat/route.ts — first request after idle can take a while to cold-load

function buildFlashcardMessages(extractedText: string, previousQuestions?: string[]) {
  let userPrompt = `You are an expert academic tutor helping a college student study.

Based ONLY on the following document content, generate exactly 10 flashcards that cover the most important key concepts. Also come up with a short, descriptive topic name (3-6 words) summarizing what this set of flashcards covers, e.g. "Evolution and Natural Selection" or "Boolean Logic Fundamentals".

Rules:
- Each question should test understanding of one specific concept
- Answers should be concise (1-2 sentences maximum)
- Questions should be clear and unambiguous
- Cover different topics across the document, not just the beginning
- Use simple language that a student can quickly understand
- Do NOT use information outside of this document
- The topic name should reflect the overall subject of the document, not a single flashcard
- Return ONLY valid JSON matching the required schema — no commentary, no markdown fences`;

  if (previousQuestions && previousQuestions.length > 0) {
    userPrompt += `\n\nIMPORTANT: Do NOT repeat any of these previously generated questions:\n${previousQuestions.map((q: string, i: number) => `${i + 1}. ${q}`).join('\n')}`;
    userPrompt += `\n\nGenerate 10 NEW and DIFFERENT flashcards covering other concepts from the document.`;
  }

  userPrompt += `\n\n--- DOCUMENT CONTENT ---\n${extractedText}`;

  return [
    {
      role: 'system',
      content:
        'You generate study flashcards from academic documents. Always respond with ONLY valid JSON matching the provided schema — no prose, no markdown code fences, nothing outside the JSON object.',
    },
    { role: 'user', content: userPrompt },
  ];
}

// Same raw-fetch pattern as callOllama() in api/chat/route.ts: native /api/chat
// endpoint, non-streaming, AbortController-backed timeout. Structured output
// is enforced via Ollama's `format` field (a JSON schema) instead of relying
// on prompt instructions alone.
async function callOllamaForFlashcards(messages: unknown[]): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    return await fetch(`${process.env.OLLAMA_PRIMARY_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OLLAMA_AUTH_TOKEN}`,
      },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL,
        messages,
        stream: false,
        format: FLASHCARD_JSON_SCHEMA,
        options: { temperature: 0 },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

// Calls Ollama and validates the result against the flashcard schema, retrying
// once if the model's output isn't valid/parseable JSON — a small model can
// occasionally wrap the JSON in prose or drop a field even with `format` set.
async function generateFlashcardsWithRetry(
  messages: unknown[]
): Promise<{ topicName: string; questions: { question: string; answer: string }[] }> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await callOllamaForFlashcards(messages);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Ollama request failed (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const content = data?.message?.content ?? '';
      const parsed = FlashcardResponseSchema.parse(JSON.parse(content));

      return parsed;
    } catch (error) {
      lastError = error;
      console.error(`Flashcard generation attempt ${attempt} failed:`, error);
    }
  }

  throw lastError;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { docUrl, docName, previousQuestions } = await request.json();

    if (!docUrl) {
      return NextResponse.json({ error: 'Document URL is required' }, { status: 400 });
    }
    if (!docUrl.startsWith(`/api/download?key=users%2F${auth.uid}%2F`) && !docUrl.startsWith(`/api/download?key=users/${auth.uid}/`)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!process.env.OLLAMA_PRIMARY_URL || !process.env.OLLAMA_AUTH_TOKEN || !process.env.OLLAMA_MODEL) {
      return NextResponse.json({ error: 'The AI assistant is not configured.' }, { status: 500 });
    }

    // 1. Fetch the document from internal MinIO proxy
    const host = request.headers.get('host');
    const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
    const fullUrl = `${protocol}://${host}${docUrl}`;

    const fileResponse = await fetch(fullUrl);
    if (!fileResponse.ok) {
      return NextResponse.json({ error: 'Failed to download document' }, { status: 500 });
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

    // 3. Build the prompt and call Ollama with structured output, retrying once on bad JSON
    const messages = buildFlashcardMessages(extractedText, previousQuestions);

    let parsed;
    try {
      parsed = await generateFlashcardsWithRetry(messages);
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
